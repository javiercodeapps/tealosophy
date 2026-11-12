# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models


class PosConfig(models.Model):
    _inherit = "pos.config"

    # In Odoo 20 `other_devices` IS the "Receipt Printers" toggle, and it is
    # required to register a pos.printer. The 18/19 compute forcibly reset this
    # flag whenever other_devices was on, making Omni Print impossible to
    # enable exactly when a receipt printer was configured. Keep it a plain
    # stored Boolean so the setting survives (the DB column is preserved).
    use_omni_print = fields.Boolean(string="Omni Print", help="Send the print job to Omni Print")
    omni_print_enable_cashdrawer = fields.Boolean(string="Cash Drawer")
    omni_print_enable_scale = fields.Boolean('Enable Scale')
