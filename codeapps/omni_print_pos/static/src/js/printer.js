/** @odoo-module **/

import { BasePrinter } from "@point_of_sale/app/utils/printer/base_printer"
import { _t } from "@web/core/l10n/translation"

const LOG = "[omni_print]"

console.log(LOG, "printer.js evaluado; OmniPrinter disponible")

function normalizeBase64Image(imgData) {
    if (typeof imgData !== "string") {
        return imgData;
    }

    const trimmed = imgData.trim();
    const base64Marker = "base64,";
    const markerIndex = trimmed.lastIndexOf(base64Marker);
    const withoutPrefix = markerIndex >= 0
        ? trimmed.slice(markerIndex + base64Marker.length)
        : trimmed;
    const compact = withoutPrefix.replace(/\s+/g, "");
    const match = compact.match(/([A-Za-z0-9+/]+={0,2})$/);

    // Ktor's Base64 decoder expects raw base64 payload only.
    return match ? match[1] : compact;
}

export class OmniPrinter extends BasePrinter {
    // Odoo 20 BasePrinter.setup() takes a `printer` record (it no longer
    // receives `pos`). Options specific to Omni Print are passed alongside it.
    setup({ printer, pos = null, proxyUrl = "http://127.0.0.1:32276", printerName = null, escposSettings = null }) {
        super.setup({ printer: printer || {} })

        this.pos = pos
        this.proxyUrl = proxyUrl
        this.printerName = printerName
        this.escposSettings = escposSettings
        console.log(LOG, "OmniPrinter.setup", {
            id: this.id,
            name: this.name,
            proxyUrl,
            printerName,
            escposSettings,
            hasPos: !!this.pos,
        })
    }

    async print(image) {
        console.log(LOG, "OmniPrinter.print invocado", {
            printerName: this.printerName,
            proxyUrl: this.proxyUrl,
            paperSize: this.paperSize,
            imageType: typeof image,
            isCanvas: typeof HTMLCanvasElement !== "undefined" && image instanceof HTMLCanvasElement,
        })
        const status = await super.print(...arguments)
        console.log(LOG, "OmniPrinter.print resultado", {
            successful: status?.successful,
            warningCode: status?.warningCode,
            message: status?.message?.body,
        })
        return status
    }

    async sendPrintingJob(img) {
        const isCanvas = typeof HTMLCanvasElement !== "undefined" && img instanceof HTMLCanvasElement
        console.log(LOG, "sendPrintingJob invocado", {
            imgType: typeof img,
            isCanvas,
            canvasSize: isCanvas ? { width: img.width, height: img.height } : null,
            isObject: typeof img === "object" && img !== null,
            imgKeys: typeof img === "object" && img !== null ? Object.keys(img).slice(0, 10) : null,
            proxyUrl: this.proxyUrl,
        })
        try {
            let img_data;
            if (isCanvas) {
                // Odoo 20 BasePrinter.print() passes the canvas straight to
                // sendPrintingJob; 18/19 already delivered a raw base64 JPEG.
                // Restore that payload so the local agent receives image data.
                img_data = img.toDataURL("image/jpeg").replace("data:image/jpeg;base64,", "");
                console.log(LOG, "canvas → base64 JPEG", { chars: img_data.length })
            } else if (typeof img === 'object' && img !== null && img.hasOwnProperty('data') && img.hasOwnProperty('isBase64') && img.isBase64) {
                img_data = img.data;
            } else {
                img_data = img;
            }
            const normalizedImage = normalizeBase64Image(img_data);
            if (typeof normalizedImage !== "string") {
                console.warn(LOG, "⚠ payload.image NO es un string; el agente no podrá imprimir", typeof normalizedImage)
            }
            let payload = { image: normalizedImage }

            // Odoo 20 renamed get_order() to getOrder().
            const order = this.pos?.getOrder?.() || this.pos?.get_order?.()
            if (order) {
                payload.doc_names = order.name
            } else {
                payload.doc_names = "/"
            }

            if (this.printerName) {
                payload.printer_name = this.printerName
            }
            if (this.escposSettings) {
                payload.escpos_settings = this.escposSettings
            }
            console.log(LOG, "sendPrintingJob → POST al agente", {
                url: `${this.proxyUrl}/print/img`,
                payload: { ...payload, image: `${String(payload.image).length} chars` },
            })
            const res = await fetch(`${this.proxyUrl}/print/img`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            })
            console.log(LOG, "sendPrintingJob ← respuesta del agente", {
                status: res.status,
                ok: res.ok,
            })
            const data = await res.json()
            console.log(LOG, "sendPrintingJob datos", data)
            return {
                result: data.success,
                printerErrorCode: data.errorCode,
            }
        } catch (error) {
            console.warn(LOG, "✗ OmniPrint error en sendPrintingJob", error)
            return {
                result: false,
                printerErrorCode: "NETWORK_ERROR",
            }
        }
    }

    async openCashbox() {
        console.log(LOG, "openCashbox invocado", `${this.proxyUrl}/cashbox/open`)
        try {
            const res = await fetch(`${this.proxyUrl}/cashbox/open`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
            })
            const data = await res.json()
            return {
                result: data.success,
                errorCode: data.errorCode,
            }
        } catch (error) {
            console.error("Open cashbox error:", error)
            return {
                result: false,
                errorCode: "NETWORK_ERROR",
            }
        }
    }

    getResultsError(printResult) {
        const errorCode = printResult?.printerErrorCode || printResult?.errorCode
        let message = _t("The printing request was sent to the Omni Print, but it wasn't able to print.") + "\n"

        if (errorCode) {
            message += "\n" + _t("The following error code was returned:") + "\n" + errorCode

            const extra_messages = {
                NETWORK_ERROR: _t("Unable to connect to the Omni Print. Please check if it's running and accessible."),
            }

            if (errorCode in extra_messages) {
                message += "\n" + extra_messages[errorCode]
            }
        } else {
            message += _t("Please check if the Omni Print is running and the printer is ready.")
        }

        return {
            successful: false,
            message: {
                title: _t("Printing failed"),
                body: message,
            },
        }
    }
}
