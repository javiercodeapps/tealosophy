/** @odoo-module */

import { patch } from "@web/core/utils/patch";
import { PosTicketPrinterPlugin } from "@point_of_sale/app/plugins/pos_ticket_printer_plugin";
import { OmniPrinter } from "./printer";

const LOG = "[omni_print]"

console.log(LOG, "pos_store.js evaluado; parcheando PosTicketPrinterPlugin.createPrinterInstance")

// Odoo 20 removed PosStore.create_printer() / hardwareProxy.printer: printers
// are now instantiated by PosTicketPrinterPlugin.createPrinterInstance() and
// stored on the pos.printer record as `_instance`.
patch(PosTicketPrinterPlugin.prototype, {
    async print(options) {
        console.log(LOG, "★ print() invocado", {
            printerId: options?.printer?.id,
            printerName: options?.printer?.name,
            hasInstance: !!options?.printer?._instance,
            instanceType: options?.printer?._instance?.constructor?.name,
            hasIframe: !!options?.iframe,
            hasImage: !!options?.image,
        })
        return super.print(...arguments)
    },
    async createPrinterInstance(printer) {
        console.log(LOG, "createPrinterInstance invocado", {
            configId: this.config?.id,
            useOmniPrint: this.config?.use_omni_print,
            otherDevices: this.config?.other_devices,
            receiptPrintersCount: this.receiptPrinters?.length,
            preparationPrintersCount: this.preparationPrinters?.length,
            printerId: printer?.id,
            printerType: printer?.printer_type,
            useType: printer?.use_type,
            omniPrinter: printer?.omni_printer,
            printerKeys: printer ? Object.keys(printer).slice(0, 30) : null,
        })
        if (!this.config?.use_omni_print) {
            console.log(LOG, "→ BYPASS: use_omni_print es falso/undefined, delego al core")
            return super.createPrinterInstance(...arguments);
        }
        console.log(LOG, "→ creando OmniPrinter")

        // Core opens the cash drawer based on `printer.use_cashdrawer`.
        // Map the legacy config flag onto the record (client-side only).
        if (this.config.omni_print_enable_cashdrawer) {
            printer.use_cashdrawer = true;
        }

        return new OmniPrinter({
            printer,
            pos: this.env?.services?.pos,
            printerName: printer.omni_printer || null,
            escposSettings: {
                width: printer.escpos_width,
                feedLines: printer.escpos_feed_lines,
                dpi: printer.escpos_dpi,
                cutPaper: printer.escpos_cut_paper,
            },
        });
    },
});
