import { patch } from "@web/core/utils/patch";
import { AccountMoveService } from "@account/services/account_move_service";
import { sendToPrinter, parseContentDisposition, removeExtension } from "@omni_print/network/download";
import { _t } from "@web/core/l10n/translation";

const LOG = "[omni_print]"

console.log(LOG, "account_move_service.js evaluado; parcheando AccountMoveService.downloadPdf")

patch(AccountMoveService.prototype, {
    // Odoo 20 added a `target` argument to the core method.
    async downloadPdf(accountMoveId, target = "download") {
        console.log(LOG, "downloadPdf invocado", { accountMoveId, target })
        const response = await this.orm.call(
            "account.move",
            "action_invoice_download_pdf",
            [accountMoveId, target]
        );
        console.log(LOG, "respuesta de action_invoice_download_pdf", response)

        if (response.type === 'ir.actions.act_url') {
            const url = response.url;
            console.log(LOG, "→ INTERCEPTANDO act_url de factura", url)

            try {
                const pdfResponse = await fetch(url);
                console.log(LOG, "respuesta del fetch de factura", {
                    status: pdfResponse.status,
                    ok: pdfResponse.ok,
                    contentDisposition: pdfResponse.headers.get("Content-Disposition"),
                })
                if (!pdfResponse.ok) {
                    throw new Error('Failed to fetch file');
                }

                // Get filename from Content-Disposition header
                const contentDisposition = pdfResponse.headers.get('Content-Disposition');
                const filename = removeExtension(parseContentDisposition(contentDisposition)) || `Invoice(${accountMoveId})`;

                const blob = await pdfResponse.blob();
                const fileType = blob.type;
                console.log(LOG, "blob de factura", { fileType, size: blob.size, filename })

                if (fileType === 'application/pdf') {
                    const printData = {
                        file: blob,
                        filename: filename,
                        reportName: `account.account_invoices`,
                        reportTitle: _t("Invoice"),
                        docNames: filename
                    };

                    console.log(LOG, "enviando PDF de factura al agente", {
                        printData: { ...printData, file: `Blob(${blob.size})` },
                    })
                    await sendToPrinter(printData);
                    console.log(LOG, "✔ PDF de factura enviado")
                    this.env.services.notification.add(_t("Document sent to printer"), {
                        type: "success",
                    });
                } else if (fileType === 'application/zip') {
                    // Handle zip file
                    const link = document.createElement('a');
                    link.href = URL.createObjectURL(blob);
                    link.download = filename;
                    link.click();
                    URL.revokeObjectURL(link.href);
                    this.env.services.notification.add(_t("Multiple documents downloaded as ZIP"), {
                        type: "success",
                    });
                } else {
                    console.warn(LOG, "tipo de archivo no soportado, NO se imprime", fileType)
                    throw new Error('Unsupported file type');
                }
            } catch (error) {
                console.warn(LOG, "✗ error procesando el documento", error);
                this.env.services.notification.add(_t("Failed to process document"), {
                    type: "danger",
                });
            }
        } else {
            console.log(LOG, "→ BYPASS: la acción no es act_url, delego a doAction", response.type)
            await this.action.doAction(response);
        }
    }
});
