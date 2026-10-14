import logging

from odoo import SUPERUSER_ID, api

_logger = logging.getLogger(__name__)

# Claves validas del campo propio de l10n_ar_edi (mismas que usaba el backport
# revertido de odoo/enterprise#102032).
LEGEND_KEYS = ("payment_on_informed_cbu", "operation_subject_to_withholding")


def migrate(cr, version):
    """Mueve la leyenda del PDF que este módulo guardaba en
    l10n_ar_invoice_pdf_legend_ux (backport de odoo/enterprise#102032, que 20.0
    incorporó en l10n_ar_edi y por lo tanto se revirtió) al campo propio
    l10n_ar_invoice_pdf_legend, que usa exactamente las mismas claves de selección, y
    limpia la columna vieja."""
    if not version:
        return

    cr.execute(
        """
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'res_company' AND column_name = 'l10n_ar_invoice_pdf_legend_ux'
        """
    )
    if not cr.fetchone():
        return

    cr.execute(
        """
        SELECT id, l10n_ar_invoice_pdf_legend_ux FROM res_company
        WHERE l10n_ar_invoice_pdf_legend_ux IS NOT NULL AND l10n_ar_invoice_pdf_legend_ux != ''
        """
    )
    rows = cr.fetchall()

    env = api.Environment(cr, SUPERUSER_ID, {})
    for company_id, legend in rows:
        if legend not in LEGEND_KEYS:
            _logger.warning("Unknown invoice PDF legend %r on company %s, not migrated", legend, company_id)
            continue
        company = env["res.company"].browse(company_id)
        # Escribimos via ORM porque el campo es compute store=True readonly=False de
        # l10n_ar_edi: así respeta su almacenamiento y su compute por country_code.
        if not company.l10n_ar_invoice_pdf_legend:
            company.l10n_ar_invoice_pdf_legend = legend

    _logger.info("Migrated invoice PDF legend to l10n_ar_edi on %s companies", len(rows))
    cr.execute("ALTER TABLE res_company DROP COLUMN l10n_ar_invoice_pdf_legend_ux")
