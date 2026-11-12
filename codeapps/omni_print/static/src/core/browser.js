/** @odoo-module **/
import { patch } from "@web/core/utils/patch";
import { browser } from "@web/core/browser/browser";
import { sendToPrinter, parseContentDisposition, removeExtension } from "../network/download";
import { _t } from "@web/core/l10n/translation";

const regex = /\/account\/download_invoice_documents\/(\d+(,\d+)*)\/pdf/;

// Odoo 20 exposes `window` directly as `browser` (the indirection object was
// deprecated/removed). `window.location` is a non-configurable, "unforgeable"
// property, so redefining it with patch() throws a TypeError and breaks the
// whole assets bundle. Core no longer navigates through `browser.location = ...`
// either, so this interception is skipped there. Invoice downloads are still
// handled by network/download.js and by omni_print_pos/account_move_service.js.
const LOG = "[omni_print]"
const locationDescriptor = Object.getOwnPropertyDescriptor(browser, "location");

console.log(LOG, "browser.js evaluado", {
    browserIsWindow: browser === window,
    hasLocationDescriptor: !!locationDescriptor,
    locationConfigurable: locationDescriptor && locationDescriptor.configurable,
})

if (locationDescriptor && locationDescriptor.configurable) {
    console.log(LOG, "parcheando el setter de browser.location")
    patch(browser, {
        /**
         * @param {String} url
         */
        set location(url) {
            console.log(LOG, "setter location invocado", url)
            const match = url.match(regex);
            if (!match) {
                console.log(LOG, "→ URL no coincide con el regex de facturas, delego al core", url)
                super.location = url
                return
            }
            console.log(LOG, "→ INTERCEPTANDO descarga de factura", { url, match: match[0] })
            fetch(url).then(response => {
                const contentDisposition = response.headers.get("Content-Disposition");
                const filename = parseContentDisposition(contentDisposition);
                console.log(LOG, "respuesta de factura", {
                    status: response.status,
                    ok: response.ok,
                    contentDisposition,
                    filename,
                })
                return Promise.all([response.blob(), filename]);
            }).then(([blob, filename]) => {
                const printData = {
                    file: blob,
                    filename,
                    reportName: "account.report_invoice_with_payments",
                    reportTitle: _t("Invoices with Payment"),
                    docNames: removeExtension(filename) || ""
                };

                const format = filename && filename.endsWith(".pdf") ? "pdf" : "zip"
                const proxyUrl = `http://127.0.0.1:32276/print/${format}`
                console.log(LOG, "enviando factura al agente", {
                    proxyUrl,
                    format,
                    blobSize: blob.size,
                    blobType: blob.type,
                    printData: { ...printData, file: `Blob(${blob.size})` },
                })
                return sendToPrinter(printData, proxyUrl)
            }).then(async (response) => {
                if (response && !response.ok) {
                    return response.text().then((text) => Promise.reject(new Error(text)));
                }
                console.log(LOG, "✔ factura enviada al agente")
                return Promise.resolve()
            }).catch(error => {
                console.warn(LOG, "✗ falló la descarga/envío de factura", error)
            })
        },
    });
} else {
    console.warn(LOG, "parche de browser.location OMITIDO (no configurable en Odoo 20). Las facturas NO se interceptan por esta vía.")
}
