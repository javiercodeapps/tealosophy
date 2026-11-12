/** @odoo-module */

import { CharField } from "@web/views/fields/char/char_field";
import { registry } from "@web/core/registry";
import { useState, onWillStart, useRef, xml } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";

export class OmniPrinterSelectorWidget extends CharField {
    static template = xml`
        <select class="o_input" t-on-change="_onPrinterChange" t-on-click="_onSelectClick" t-ref="printerSelect">
            <option
                t-att-selected="false === value"
                value=""
                >Select a printer...</option>
            <t t-foreach="state.printers" t-as="printer" t-key="printer.name">
                <option
                    t-att-selected="printer.name === value"
                    t-att-value="printer.name"
                    >
                    <t t-esc="printer.display_name"/>
                </option>
            </t>
        </select>`;

    setup() {
        super.setup();
        this.state = useState({
            printers: [],
            loading: true,
            error: null,
            hasFetched: false,
        });

        this.notification = useService("notification");
        this.printerSelectRef = useRef("printerSelect");

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
            const response = await fetch(url, {
                headers: {
                    'Accept': 'application/json'
                },
                credentials: 'include'
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
            }

            const data = await response.json();
            if (Array.isArray(data)) {
                this.state.printers = data;
            } else {
                 throw new Error("Invalid data format received from printer API.");
            }

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