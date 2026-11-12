/** @odoo-module **/

import { BasePrinter } from "@point_of_sale/app/printer/base_printer"
import { _t } from "@web/core/l10n/translation"

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
    setup({ pos, proxyUrl = "http://127.0.0.1:32276", printerName = null, escposSettings = null }) {
        super.setup(...arguments)

        this.pos = pos
        this.proxyUrl = proxyUrl
        this.printerName = printerName
        this.escposSettings = escposSettings
    }

    async sendPrintingJob(img) {
        try {
            let img_data;
            if (typeof img === 'object' && img.hasOwnProperty('data') && img.hasOwnProperty('isBase64') && img.isBase64) {
                img_data = img.data;
            } else {
                img_data = img;
            }
            const normalizedImage = normalizeBase64Image(img_data);
            let payload = { image: normalizedImage }

            const order = this.pos.get_order()
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
            const res = await fetch(`${this.proxyUrl}/print/img`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            })
            const data = await res.json()
            return {
                result: data.success,
                printerErrorCode: data.errorCode,
            }
        } catch (error) {
            console.error("OmniPrint error:", error)
            return {
                result: false,
                printerErrorCode: "NETWORK_ERROR",
            }
        }
    }

    async openCashbox() {
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
        const errorCode = printResult.errorCode
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
