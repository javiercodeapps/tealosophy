from odoo import api, models

class ResPartner(models.Model):
    _inherit = 'res.partner'

    @api.model
    def _load_pos_data_fields(self, config):
        params = super()._load_pos_data_fields(config)
        
        # Campos críticos que el frontend necesita mapear con Object.entries()
        fields_to_add = [
            'credit_limit', 'use_partner_credit_limit', 'commercial_partner_id', 
            'total_all_due', 'total_all_due_abs', 'total_all_overdue',
            'total_due', 'total_invoiced', 'total_overdue'
        ]
        
        # Los agregamos asegurándonos de que existan y de no duplicarlos
        for field in fields_to_add:
            if field in self._fields and field not in params:
                params.append(field)

        return params

