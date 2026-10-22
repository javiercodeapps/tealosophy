from odoo import models


class AccountMoveLine(models.Model):
    _inherit = "account.move.line"

    def _get_stock_moves(self):
        """Stock moves backing this invoice line.

        Odoo 20 dropped the generic getter Odoo 19 had: a vendor bill line reaches its
        receipts through ``purchase_line_id`` and a customer invoice line its deliveries
        through ``sale_line_ids``. Kept as a single entry point because the guards in this
        module all need it.
        """
        self.ensure_one()
        if "purchase_line_id" in self._fields and self.purchase_line_id:
            return self.purchase_line_id.move_ids.filtered("is_valued")
        if "sale_line_ids" in self._fields and self.sale_line_ids:
            return self.sale_line_ids.move_ids.filtered("is_valued")
        return self.env["stock.move"]

    def _compute_account_id(self):
        """Book the purchase invoice line of a move migrated from v18 to the counterpart
        of its valuation entry, instead of to the stock valuation account.

        Out of the box (``account``) this compute overwrites the line account with
        ``accounts['stock_valuation']`` for lines valued in real time, booking the asset
        increase in the invoice itself. For a move whose valuation was ALREADY booked in
        v18 (``stock_valuation_migrated``) that increases the asset twice: the stock is
        already valued. The counterpart of the migrated entry is used instead —the credit of
        that increase— which is the account the vendor bill has to settle. See task 70174.
        """
        super()._compute_account_id()
        for line in self:
            move = line.move_id
            if not move.is_purchase_document() or line.display_type == "cogs":
                continue
            if not line._use_inventory_valuation():
                continue
            stock_moves = line._get_stock_moves()
            if not stock_moves or not all(m.stock_valuation_migrated for m in stock_moves):
                continue
            counterpart_account = stock_moves[:1]._get_migrated_valuation_counterpart_account()
            if counterpart_account:
                line.account_id = counterpart_account
