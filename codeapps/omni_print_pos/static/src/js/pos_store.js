/** @odoo-module */

import { PosStore } from "@point_of_sale/app/store/pos_store";
import { OmniPrinter } from "./printer";
import { patch } from "@web/core/utils/patch";

patch(PosStore.prototype, {
    afterProcessServerData() {
        var self = this;
        return super.afterProcessServerData(...arguments).then(function () {
            if (self.config.use_omni_print) {
                self.hardwareProxy.printer = new OmniPrinter({ pos: self });
                self.config.iface_cashdrawer = self.config.omni_print_enable_cashdrawer;
                
                if (self.config.omni_print_enable_scale) {
                    self.config.iface_electronic_scale = self.config.omni_print_enable_scale;
                }
            }
        });
    },
    create_printer(config) {
        if (config.printer_type == 'omni_print') {
            return new OmniPrinter({
                pos: this,
                printerName: config.omni_printer,
                escposSettings: {
                    width: config.escpos_width,
                    feedLines: config.escpos_feed_lines,
                    dpi: config.escpos_dpi,
                    cutPaper: config.escpos_cut_paper,
                },
            });
        } else {
            return super.create_printer(...arguments)
        }
    },
});
