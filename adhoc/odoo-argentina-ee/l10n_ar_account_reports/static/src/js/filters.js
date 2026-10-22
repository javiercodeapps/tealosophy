/** @odoo-module **/

import { AccountReportFilters } from "@account_reports/components/account_report/filters/filters";
import { patch } from "@web/core/utils/patch";

/**
 * Patch AccountReportFilters to handle sub-monthly periods like fortnightly.
 *
 * Odoo 20 derives every filter's range from `computePeriodRange`, which divides by
 * `months_per_period`. Argentine return types with a sub-monthly periodicity expose
 * `months_per_period = 0` because their offset is expressed in days, so the division
 * yields Infinity and every date of the filter becomes invalid. We fall back to the
 * containing month for those filters; the exact fortnightly range keeps being computed
 * server-side by `_get_period_boundaries`.
 */
patch(AccountReportFilters.prototype, {
    computePeriodRange(date, startDay, startMonth, monthsPerPeriod) {
        if (!monthsPerPeriod) {
            return super.computePeriodRange(date, 1, 1, 1);
        }
        return super.computePeriodRange(date, startDay, startMonth, monthsPerPeriod);
    },
});
