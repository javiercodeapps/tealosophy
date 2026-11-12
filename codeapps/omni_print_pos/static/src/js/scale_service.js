/** @odoo-module **/

/**
 * Odoo 20 removed the `PosScaleService` (and the old scale_screen service).
 * Scales are now `ScaleInterface` subclasses registered in the
 * `electronic_scales` registry: PosStore instantiates each of them and keeps
 * the first one whose `connectToScale()` returns true. Extending the interface
 * (instead of reimplementing readWeight) keeps tare / confirmWeight / error
 * handling in sync with core.
 */

import { registry } from "@web/core/registry"
import { _t } from "@web/core/l10n/translation"
import { ScaleInterface } from "@point_of_sale/app/utils/scale/scale_interface"

const BASE_URL = "http://127.0.0.1:32276"

export class OmniPrintScaleInterface extends ScaleInterface {
    async connectToScale() {
        // Let core (web serial / IoT) handle the scale when Omni Print is off.
        if (!this.pos?.config?.omni_print_enable_scale) {
            return false
        }

        try {
            const response = await fetch(`${BASE_URL}/scale/status`, {
                headers: { Accept: "application/json" },
            })
            if (!response.ok) {
                return false
            }
            const data = await response.json()
            return data.status === "connected"
        } catch (error) {
            console.error("OmniPrint scale is not reachable:", error)
            return false
        }
    }

    async _readWeight() {
        const response = await fetch(`${BASE_URL}/scale/weight`, {
            headers: { Accept: "application/json" },
        })
        if (!response.ok) {
            throw new Error(_t("Failed to read from scale"))
        }

        const data = await response.json()
        if (data.status !== "success" || typeof data.weight !== "number") {
            throw new Error(_t("Invalid scale response"))
        }

        return data.weight
    }
}

registry.category("electronic_scales").add("omni_print", OmniPrintScaleInterface, { sequence: 10 })
