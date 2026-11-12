/** @odoo-module **/

import { download, downloadFile } from "@web/core/network/download"
import { makeErrorFromResponse, ConnectionLostError } from "@web/core/network/rpc"

const _download = download._download

const LOG = "[omni_print]"

// Guardamos también el rastro en window para poder inspeccionarlo desde la
// consola aunque se haya limpiado el log: __omniPrintTrace
const trace = (window.__omniPrintTrace = window.__omniPrintTrace || [])
const dbg = (...args) => {
    trace.push({ at: new Date().toISOString(), level: "log", args })
    if (trace.length > 100) trace.shift()
    console.log(LOG, ...args)
}
const warn = (...args) => {
    trace.push({ at: new Date().toISOString(), level: "warn", args })
    if (trace.length > 100) trace.shift()
    console.warn(LOG, ...args)
}

dbg("network/download.js evaluado; parcheando download._download", {
    originalType: typeof _download,
})

export function sendToPrinter({ file, reportName, reportTitle, docNames }, proxyUrl = "http://127.0.0.1:32276/print/pdf") {
    const formData = new FormData();
    formData.append("file", file, reportName);
    formData.append("reportName", reportName);
    formData.append("reportTitle", reportTitle);
    formData.append("docNames", docNames);

    dbg("sendToPrinter → POST al agente", proxyUrl, {
        reportName,
        reportTitle,
        docNames,
        fileName: file && file.name,
        fileSize: file && file.size,
        fileType: file && file.type,
        formFields: [...formData.keys()],
    })

    return fetch(proxyUrl, {
        method: "POST",
        body: formData,
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Accept-Referrer-Policy": "no-referrer",
        },
    }).then((response) => {
        dbg("sendToPrinter ← respuesta del agente", {
            status: response.status,
            ok: response.ok,
            statusText: response.statusText,
        })
        return response
    }).catch((error) => {
        warn("sendToPrinter ✗ fetch falló (agente apagado / CORS / mixed-content?)", error)
        throw error
    });
}


download._download = async function (options) {
    dbg("download() invocado", {
        url: options && options.url,
        hasForm: !!(options && options.form),
        dataKeys: options && options.data ? Object.keys(options.data) : null,
        rawData: options && options.data ? options.data.data : null,
    })

    if (!options.url || options.url !== "/report/download") {
        dbg("→ BYPASS: no es /report/download, delego al core", options && options.url)
        return _download.apply(this, arguments)
    }

    let reportUrl
    let reportType
    try {
        const parsed = JSON.parse(options.data.data)
        reportUrl = parsed[0]
        reportType = parsed[1]
    } catch (error) {
        warn("→ BYPASS: no pude parsear options.data.data", options.data.data, error)
        return _download.apply(this, arguments)
    }
    dbg("datos del reporte parseados", { reportUrl, reportType })

    if (reportType !== "qweb-pdf" && reportType !== "qweb-text") {
        warn("→ BYPASS: reportType no es exactamente 'qweb-pdf'/'qweb-text' (Odoo 20 puede usar 'qweb-pdf-<engine>')", reportType)
        return _download.apply(this, arguments)
    }

    dbg("→ INTERCEPTANDO descarga de reporte", reportType)

    const formData = new FormData(options.form || undefined)
    if (!options.form) {
        Object.entries(options.data).forEach(([key, value]) => formData.append(key, value))
    }
    formData.append("token", "dummy-because-api-expects-one")
    if (window.odoo && window.odoo.csrf_token) {
        formData.append("csrf_token", window.odoo.csrf_token)
    }
    dbg("POST a /report/download", {
        url: options.form ? options.form.action : options.url,
        method: options.form ? options.form.method : "POST",
        formFields: [...formData.keys()],
        hasCsrf: !!(window.odoo && window.odoo.csrf_token),
    })

    return fetch(options.form ? options.form.action : options.url, {
        method: options.form ? options.form.method : "POST",
        body: formData,
    }).then((response) => {
        dbg("respuesta de /report/download", {
            status: response.status,
            ok: response.ok,
            type: response.type,
            contentDisposition: response.headers.get("Content-Disposition"),
            xReportName: response.headers.get("X-Report-Name"),
            xReportTitle: response.headers.get("X-Report-Title"),
            xReportDocnames: response.headers.get("X-Report-Docnames"),
        })
        handleResponse(response, reportType).catch((error) => {
            warn("handleResponse rechazó", error)
        })
    }).catch((error) => {
        warn("fetch de /report/download falló", error)
        Promise.reject(new ConnectionLostError())
    })
}

function handleResponse(response, reportType) {
    dbg("handleResponse", { ok: response.ok, status: response.status, reportType })
    if (!response.ok) {
        return response.text().then((text) => {
            warn("respuesta no-OK del servidor", { status: response.status, text: String(text).slice(0, 500) })
            return parseError(text, response.status)
        })
    }

    const contentDisposition = response.headers.get("Content-Disposition")
    const filename = parseContentDisposition(contentDisposition)
    dbg("cabeceras recibidas", {
        contentDisposition,
        filename,
        xReportName: response.headers.get("X-Report-Name"),
        xReportTitle: response.headers.get("X-Report-Title"),
        xReportDocnames: response.headers.get("X-Report-Docnames"),
    })

    return response
        .blob()
        .then(async (blob) => {
            const mimetype = blob.type
            dbg("blob recibido", { mimetype, size: blob.size, filename })
            if (mimetype === "text/html" || !filename) {
                warn("blob inválido o sin filename → NO se envía a imprimir", { mimetype, filename })
                return Promise.reject(new Error("Invalid MIME type or filename missing."))
            }

            function getDecodedHeader(key) {
                return response.headers.get(key) && decodeURIComponent(response.headers.get(key))
            }

            const printData = {
                file: blob,
                filename,
                reportName: getDecodedHeader("X-Report-Name") || "",
                reportTitle: getDecodedHeader("X-Report-Title") || "",
                docNames: getDecodedHeader("X-Report-Docnames") || removeExtension(filename) || ""
            };

            const format = reportType === "qweb-pdf" ? "pdf" : "zpl"
            const proxyUrl = `http://127.0.0.1:32276/print/${format}`
            dbg("enviando al agente local", {
                proxyUrl,
                format,
                printData: { ...printData, file: `Blob(${blob.size})` },
            })
            return sendToPrinter(printData, proxyUrl)
                .then(async (uploadResponse) => {
                    if (uploadResponse && !uploadResponse.ok) {
                        return uploadResponse.text().then((text) => Promise.reject(new Error(text)));
                    }
                    dbg("✔ impresión enviada correctamente al agente")
                    return Promise.resolve()
                }).then(() => Promise.resolve(filename))
                .catch((error) => {
                    warn('print error → fallback a descarga del navegador', error);
                    downloadFile(blob, filename, mimetype);
                    return Promise.resolve(filename);
                });
        });
}

function parseError(text, status) {
    const doc = new DOMParser().parseFromString(text, "text/html")
    const nodes = doc.body.children.length ? doc.body.children : [doc.body]
    let error = {
        message: "Arbitrary Uncaught Python Exception",
        data: {
            debug: `${status}\n${nodes[0].textContent}\n${nodes.length > 1 ? nodes[1].textContent : ""}`,
        },
    }
    return Promise.reject(makeErrorFromResponse(error))
}

export function parseContentDisposition(contentDisposition) {
    if (!contentDisposition) {
        return null
    }

    const filenameRfc5987Regex = /filename\*=([^';]+)'([^';]*)'([^';]*)/
    const matchesRfc5987 = filenameRfc5987Regex.exec(contentDisposition)
    if (matchesRfc5987 && matchesRfc5987.length === 4) {
        const charset = matchesRfc5987[1]
        const language = matchesRfc5987[2]
        const encodedFilename = matchesRfc5987[3]
        const decodedFilename = decodeURIComponent(encodedFilename)
        return decodedFilename
    }

    const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/
    const matches = filenameRegex.exec(contentDisposition)
    if (matches != null && matches[1]) {
        const filename = matches[1].replace(/['"]/g, "")
        return decodeURIComponent(filename)
    }

    return null
}

export function removeExtension(filename) {
    return filename.replace(/\.[^/.]+$/, "");
}

dbg("parche instalado en download._download:", download._download !== _download)
