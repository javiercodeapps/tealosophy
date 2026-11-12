/** @odoo-module **/

/**
 * Patch the original PosScaleService so that it can talk to the OmniPrint
 * electronic scale backend (HTTP JSON API) while retaining full compatibility
 * with future upstream changes (e.g. new confirmWeight() method introduced in
 * https://github.com/odoo/odoo/pull/213537).
 *
 * We purposely avoid registering a brand-new `pos_scale` service.  Instead, we
 * extend the existing service at runtime to minimise the risk of merge
 * conflicts when Odoo core evolves.
 */

import { patch } from "@web/core/utils/patch"
import { _t } from "@web/core/l10n/translation"
import { PosScaleService } from "@point_of_sale/app/screens/scale_screen/scale_service"

patch(PosScaleService.prototype, {
    setup(env, deps) {
        super.setup(env, deps)

        // Do not capture config here; it may be empty at this stage.
        this.baseUrl = "http://127.0.0.1:32276"
    },

    async readWeight() {
        // If OmniPrint scale is disabled, fall back to the original implementation
        if (!this.env.services?.pos?.config?.omni_print_enable_scale) {
            return super.readWeight?.(...arguments);
        }

        this.loading = true
        try {
            await this._checkScaleIsConnected()
            const { weight } = await this._getWeightFromScale()
            this.weight = weight
            // Keep measuring even after a stable reading so that tare can be applied on subsequent readings.
        } catch (error) {
            this.isMeasuring = false
            this.onError?.(error.message || _t("Cannot connect to the scale"))
        } finally {
            this.loading = false
            this._setTareIfRequested?.()
        }
    },

    async _getWeightFromScale() {
        // Use default hardware proxy if OmniPrint scale is disabled
        if (!this.env.services?.pos?.config?.omni_print_enable_scale) {
            return super._getWeightFromScale?.(...arguments);
        }

        const controller = new AbortController()
        try {
            const response = await fetch(`${this.baseUrl}/scale/weight`, {
                signal: controller.signal,
                headers: { Accept: "application/json" },
            })

            if (!response.ok) {
                throw new Error(_t("Failed to read from scale"))
            }

            const data = await response.json()
            if (data.status !== "success" || typeof data.weight !== "number") {
                throw new Error(_t("Invalid scale response"))
            }

            return { weight: data.weight, stable: !!data.stable }
        } catch (error) {
            console.error("Scale error:", error)
            throw error
        }
    },

    _checkScaleIsConnected() {
        // Fallback when OmniPrint scale is disabled
        if (!this.env.services?.pos?.config?.omni_print_enable_scale) {
            return super._checkScaleIsConnected?.(...arguments);
        }

        return (async () => {
            try {
                const statusUrl = `${this.baseUrl}/scale/status`
                const response = await fetch(statusUrl, {
                    headers: { Accept: "application/json" },
                })

                if (!response.ok) {
                    throw new Error(_t("Failed to check scale status"))
                }

                const data = await response.json()
                if (data.status !== "connected") {
                    throw new Error(_t("Scale is not connected"))
                }

                return true
            } catch (error) {
                console.error("Scale status check failed:", error)
                throw new Error(_t("Cannot weigh product - ") + error.message)
            }
        })()
    },
})
