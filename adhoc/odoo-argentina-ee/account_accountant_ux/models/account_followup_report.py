from odoo import _, fields, models

from odoo.addons.account_reports.utils.report_data_objects import AccountReportLineData


class FollowupReportCustomHandler(models.AbstractModel):
    _inherit = "account.followup.report.handler"

    def _custom_line_postprocessor(self, report, options, lines):
        """Append "Total Due" / "Total Overdue" after every partner of the follow-up report.

        The totals are the sum of the ``amount_residual`` of the partner's open items, leaving
        out the ones flagged "No Reminder" (``no_followup``); the overdue subset is the one
        whose due date is already past, the same criterion ``account.move.line.followup_overdue``
        uses. The amount lands in the report's "Residual" column, the one holding
        ``amount_residual``.
        """
        lines = super()._custom_line_postprocessor(report, options, lines)
        if self._name != "account.followup.report.handler":
            return lines

        column_index = {col["expression_label"]: index for index, col in enumerate(options["columns"])}
        residual_index = column_index.get("amount_residual")
        if residual_index is None:
            return lines
        maturity_index = column_index.get("date_maturity")
        no_followup_index = column_index.get("no_followup")
        today = fields.Date.context_today(report)

        result = []
        partner_line = None
        partner_amls = []

        def flush():
            if partner_line is not None:
                result.extend(
                    self._get_followup_total_lines(
                        report,
                        options,
                        partner_line,
                        partner_amls,
                        residual_index,
                        maturity_index,
                        no_followup_index,
                        today,
                    )
                )

        for line in lines:
            markup, model, _res_id = report._parse_line_id(line.id)[-1]
            if model == "res.partner":
                flush()
                partner_line, partner_amls = line, []
                result.append(line)
            elif isinstance(markup, dict) and markup.get("groupby") == "id" and partner_line is not None:
                partner_amls.append(line)
                result.append(line)
            else:
                flush()
                partner_line, partner_amls = None, []
                result.append(line)
        flush()
        return result

    def _get_followup_total_lines(
        self, report, options, partner_line, aml_lines, residual_index, maturity_index, no_followup_index, today
    ):
        total_due = 0.0
        total_overdue = 0.0
        for line in aml_lines:
            columns = line.columns
            if no_followup_index is not None and columns[no_followup_index].no_format:
                continue
            residual = columns[residual_index].no_format or 0.0
            total_due += residual
            if maturity_index is not None:
                maturity = columns[maturity_index].no_format
                if maturity and maturity < today:
                    total_overdue += residual
        return [
            self._get_followup_total_line(
                report, options, partner_line, "total_due", _("Total Due"), total_due, residual_index
            ),
            self._get_followup_total_line(
                report, options, partner_line, "total_overdue", _("Total Overdue"), total_overdue, residual_index
            ),
        ]

    def _get_followup_total_line(self, report, options, partner_line, markup, name, amount, residual_index):
        """Build a partner summary line showing ``amount`` in the "Residual" column."""
        columns = [
            report._build_column_data(amount, col, options=options, currency=self.env.company.currency_id)
            if index == residual_index
            else report._build_column_data(None, None)
            for index, col in enumerate(options["columns"])
        ]
        return AccountReportLineData(
            id=report._get_generic_line_id(None, None, markup=markup, parent_line_id=partner_line.id),
            name=name,
            level=(partner_line.level or 0) + 2,
            parent_id=partner_line.id,
            columns=columns,
            css_class="total",
            unfoldable=False,
            unfolded=False,
        )
