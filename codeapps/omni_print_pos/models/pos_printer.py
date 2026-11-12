# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models, api, _
from odoo.exceptions import ValidationError
import json
import logging
_logger = logging.getLogger(__name__)

class PosPrinter(models.Model):

    _inherit = 'pos.printer'

    printer_type = fields.Selection(selection_add=[('omni_print', 'Use Omni Print printer proxy')])
    omni_printer = fields.Char(string="Printer")

    escpos_width = fields.Selection([('WIDTH_58MM', '58mm'), ('WIDTH_80MM', '80mm')], string="Paper Width", default='WIDTH_80MM')
    escpos_feed_lines = fields.Integer(string="Feed Lines", default=2)
    escpos_dpi = fields.Selection([('203', '203 DPI'), ('300', '300 DPI')], string="DPI", default='203')
    escpos_cut_paper = fields.Boolean(string="Cut Paper", default=True)

    @api.model
    def _load_pos_data_fields(self, config_id):
        params = super()._load_pos_data_fields(config_id)
        params += ['omni_printer', 'escpos_width', 'escpos_feed_lines', 'escpos_dpi', 'escpos_cut_paper']
        return params
