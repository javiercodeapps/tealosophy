/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { PosTicketPrinterPlugin } from "@point_of_sale/app/plugins/pos_ticket_printer_plugin";
import { OmniPrinter } from "./printer";

const LOG = "[omni_print]"

console.log(LOG, "pos_store.js evaluado; parcheando PosTicketPrinterPlugin.createPrinterInstance")

function ids(records) {
    try {
        return (records || []).map((p) => p?.id ?? p)
    } catch (error) {
        return `ERROR: ${error}`
    }
}

function pluginSnapshot(plugin) {
    let config = null
    let printerKeys = null
    try {
        config = plugin.config
        printerKeys = config ? Object.keys(config).filter((k) => /print|device|receipt/i.test(k)) : null
    } catch (error) {
        config = `ERROR: ${error}`
    }
    const printers = (() => {
        try {
            return plugin.printers
        } catch (error) {
            return []
        }
    })()
    return {
        posConfigId: typeof odoo !== "undefined" ? odoo.pos_config_id : null,
        posSessionId: typeof odoo !== "undefined" ? odoo.pos_session_id : null,
        configExists: !!config && typeof config !== "string",
        configError: typeof config === "string" ? config : null,
        configPrinterKeys: printerKeys,
        useOmniPrint: config?.use_omni_print,
        otherDevices: config?.other_devices,
        autoPrint: config?.autoPrint,
        receiptPrinterIds: ids(config?.receipt_printer_ids),
        preparationPrinterIds: ids(config?.preparation_printer_ids),
        printers: printers.map((p) => ({
            id: p?.id,
            name: p?.name,
            useType: p?.use_type,
            printerType: p?.printer_type,
            omniPrinter: p?.omni_printer,
            hasInstance: !!p?._instance,
            instanceType: p?._instance?.constructor?.name || null,
        })),
    }
}

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
    /**
     * Instrumentation only: this is the method that decides between a real
     * printer and the browser dialog (`printWeb`). It runs on every print, so
     * its log tells us whether `createPrinterInstance` was even reached.
     */
    async printWithFallback(options = {}) {
        const snapshot = pluginSnapshot(this)
        console.log(LOG, "printWithFallback invocado", {
            ...snapshot,
            printerArg: options?.printer?.id ?? null,
            fallbacksArg: Array.isArray(options?.fallbacks)
                ? ids(options.fallbacks)
                : String(options?.fallbacks),
            webFallback: options?.webFallback,
            download: options?.download,
            hasIframe: !!options?.iframe,
            hasImage: !!options?.image,
            hasReceiptPrinters: this.hasReceiptPrinters,
            defaultPrinterId: this.defaultPrinter?.id ?? null,
        })

        // Safety net: `use_omni_print` is on but this POS has no receipt printer
        // configured. Core would silently fall back to the browser dialog, so
        // print through the local agent directly instead.
        if (this.config?.use_omni_print && options?.download !== true) {
            const configured =
                !!options?.printer ||
                !!this.defaultPrinter ||
                (Array.isArray(snapshot.receiptPrinterIds) && snapshot.receiptPrinterIds.length > 0)
            if (!configured) {
                console.log(LOG, "→ sin impresoras configuradas: uso OmniPrinter directo (fallback)")
                try {
                    const status = await this.print({
                        printer: this._getOmniFallbackPrinter(),
                        iframe: options?.iframe,
                        image: options?.image,
                    })
                    if (status?.successful) {
                        return status
                    }
                    console.warn(LOG, "✗ OmniPrinter directo no pudo imprimir; delego al core", status)
                } catch (error) {
                    console.warn(LOG, "✗ OmniPrinter directo lanzó excepción; delego al core", error)
                }
            }
        }

        return super.printWithFallback(...arguments)
    },
    /**
     * Printer instance used when no `pos.printer` is configured. It has no
     * `printerName`, so the local agent falls back to its default printer.
     */
    _getOmniFallbackPrinter() {
        if (!this.__omniFallbackPrinter) {
            const instance = new OmniPrinter({
                printer: { id: 0, name: "Omni Print (directo)", paper_size: "80" },
                pos: this.env?.services?.pos,
                printerName: null,
            })
            this.__omniFallbackPrinter = {
                id: 0,
                name: "Omni Print (directo)",
                _instance: instance,
            }
        }
        return this.__omniFallbackPrinter
    },
    /**
     * Reached only when there is no printer to try -> native browser dialog.
     */
    printWeb(iframe) {
        console.log(LOG, "⚠ printWeb() invocado → se abre el diálogo del navegador", {
            hasIframe: !!iframe,
            receiptPrinterIds: ids(this.config?.receipt_printer_ids),
            useOmniPrint: this.config?.use_omni_print,
        })
        return super.printWeb(...arguments)
    },
    _print(win) {
        let stack = null
        try {
            stack = new Error("window.print()").stack?.split("\n").slice(1, 8).join("\n")
        } catch (error) {
            stack = String(error)
        }
        console.log(LOG, "⚠ window.print() invocado", { stack })
        return super._print(...arguments)
    },
    async initPrinters() {
        console.log(LOG, "initPrinters invocado", pluginSnapshot(this))
        const result = await super.initPrinters(...arguments)
        console.log(LOG, "initPrinters terminado", pluginSnapshot(this))
        return result
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
