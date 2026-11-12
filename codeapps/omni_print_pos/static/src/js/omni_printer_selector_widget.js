/** @odoo-module */

import { CharField } from "@web/views/fields/char/char_field";
import { registry } from "@web/core/registry";
import { proxy, onWillStart, signal, xml } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";

export class OmniPrinterSelectorWidget extends CharField {
    static template = xml`
        <select class="o_input" t-on-change="this._onPrinterChange" t-on-click="this._onSelectClick" t-ref="this.printerSelectRef">
            <option
                t-att-selected="false === this.value"
                value=""
                >Select a printer...</option>
            <t t-foreach="this.state.printers" t-as="printer" t-key="printer.name">
                <option
                    t-att-selected="printer.name === this.value"
                    t-att-value="printer.name"
                    >
                    <t t-out="printer.display_name"/>
                </option>
            </t>
        </select>`;

    printerSelectRef = signal.ref();

    setup() {
        super.setup();
        this.state = proxy({
            printers: [],
            loading: true,
            error: null,
            hasFetched: false,
        });

        this.notification = useService("notification");

        onWillStart(async () => {
            // Always fetch printers on initial load
            await this._fetchPrinters();
            this.state.hasFetched = true;
        });
    }

    get value() {
        return this.props.record.data[this.props.name] || "";
    }

    _stringify(value) {
        return value;
    }

    async _fetchPrinters() {
        const url = `http://127.0.0.1:32276/printers`;

        try {
            // Sin `credentials: 'include'`: el agente local (127.0.0.1:32276)
            // no autentica con cookies y responde con
            // `Access-Control-Allow-Origin: *`. El navegador rechaza ese
            // comodin si la peticion lleva credenciales ("must not be the
            // wildcard '*' when the request's credentials mode is 'include'").
            // El modo por defecto (`same-origin`) no envia cookies a otro
            // origen y acepta el comodin.
            const response = await fetch(url, {
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
            }

            const data = await response.json();
            // El agente responde {"status": "success", "count": N,
            // "printers": [...]}; se acepta tambien la lista pelada por
            // compatibilidad con versiones antiguas del agente.
            const printers = Array.isArray(data) ? data : (data && data.printers);
            if (!Array.isArray(printers)) {
                 throw new Error("Invalid data format received from printer API.");
            }
            this.state.printers = printers;

        } catch (error) {
            console.error("Failed to fetch printers:", error);
            this.state.error = `Failed to fetch printers: ${error.message}`;
            this.notification.add(this.state.error, { type: "danger" });
            this.state.printers = [];
        } finally {
            this.state.loading = false;
        }
    }

    async _onSelectClick(ev) {
        if (!this.state.hasFetched) {
            this.state.loading = true;
            await this._fetchPrinters();
            this.state.hasFetched = true;
        }
    }

    _onPrinterChange(ev) {
        const selectedValue = ev.target.value;
        this.props.record.update({ [this.props.name]: selectedValue });
    }
}

registry.category("fields").add("omni_printer_selector", {
    component: OmniPrinterSelectorWidget,
    supportedTypes: ["char"], // Explicitly define supported field types
});