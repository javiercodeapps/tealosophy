/** @odoo-module */

import { patch } from "@web/core/utils/patch";
import { PosTicketPrinterPlugin } from "@point_of_sale/app/plugins/pos_ticket_printer_plugin";
import { OmniPrinter } from "./printer";

// Odoo 20 removed PosStore.create_printer() / hardwareProxy.printer: printers
// are now instantiated by PosTicketPrinterPlugin.createPrinterInstance() and
// stored on the pos.printer record as `_instance`.
patch(PosTicketPrinterPlugin.prototype, {
    async createPrinterInstance(printer) {
        if (!this.config?.use_omni_print) {
            return super.createPrinterInstance(...arguments);
        }

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
