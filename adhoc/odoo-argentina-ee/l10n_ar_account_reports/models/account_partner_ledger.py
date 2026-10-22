from odoo import api, models


class PartnerLedgerCustomHandler(models.AbstractModel):
    _inherit = "account.partner.ledger.report.handler"

    @api.model
    def _get_custom_groupby_map(self):
        """Show more information next to the partner's name: the identification label and the
        document number.

        * before the partner was shown as "Partner Name"
        * now it is shown as "Partner Name (CUIT: 1234234235)"
        """
        groupby_map = super()._get_custom_groupby_map()
        partner_entry = groupby_map.get("partner_id")
        if not partner_entry:
            return groupby_map

        build_labels = partner_entry["label_builder"]

        def partner_line_label_builder(ids):
            labels = build_labels(ids)
            for partner in self.env["res.partner"].browse([res_id for res_id in ids if res_id]):
                name = labels.get(partner.id)
                if name and partner.l10n_ar_identification_label and partner.vat:
                    doc_info = f"{partner.l10n_ar_identification_label}: {partner.vat}"
                    labels[partner.id] = f"{name[: 128 - len(doc_info) - 3]} ({doc_info})"
            return labels

        partner_entry["label_builder"] = partner_line_label_builder
        return groupby_map
