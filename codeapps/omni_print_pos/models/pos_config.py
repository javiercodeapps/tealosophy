# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models, _


class PosConfig(models.Model):
    _inherit = "pos.config"

    use_omni_print = fields.Boolean(string="Omni Print", compute="_compute_use_omni_print", readonly=False, store=True, help="Send the print job to Omni Print")
    omni_print_enable_cashdrawer = fields.Boolean(string="Cash Drawer")
    omni_print_enable_scale = fields.Boolean('Enable Scale')

    # `is_posbox` (and `iface_cashdrawer` / `iface_electronic_scale`) were
    # removed from pos.config in Odoo 20. Depending on a non-existent field
    # raises ValueError while the registry is built.
    @api.depends('other_devices')
    def _compute_use_omni_print(self):
        for config in self:
            if config.other_devices:
                config.use_omni_print = False
