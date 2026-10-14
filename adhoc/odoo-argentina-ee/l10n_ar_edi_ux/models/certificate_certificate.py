import logging

from cryptography import x509
from odoo import api, fields, models

_logger = logging.getLogger(__name__)


class CertificateCertificate(models.Model):
    _inherit = "certificate.certificate"

    content_filename = fields.Char()

    l10n_ar_subject_serial_number = fields.Char(
        compute="_compute_l10n_ar_subject_serial_number",
        string="Belongs to",
        help="This is the CUIT information of the related ARCA Certificate.",
    )

    @api.depends("pem_certificate")
    def _compute_l10n_ar_subject_serial_number(self):
        """Compute the subject serial number needed to then check if the afip connection can be
        re use for multiple branches if they share the same certificate CUIT."""
        for certificate in self:
            if certificate.l10n_ar_subject_serial_number or not certificate.pem_certificate:
                continue
            # En Odoo 20 pem_certificate es un Binary: .content son los bytes en crudo del PEM,
            # igual que lo que usa el propio certificate.certificate de core. No hay que
            # hacer b64decode (el PEM ya trae sus cabeceras -----BEGIN...-----).
            try:
                cert = x509.load_pem_x509_certificate(certificate.pem_certificate.content)
            except (ValueError, TypeError):
                _logger.warning(
                    "Could not load the PEM certificate %s to read its subject serial number", certificate.id
                )
                continue
            l10n_ar_subject_serial_number = cert.subject.get_attributes_for_oid(x509.oid.NameOID.SERIAL_NUMBER)
            if l10n_ar_subject_serial_number:
                certificate.l10n_ar_subject_serial_number = l10n_ar_subject_serial_number[0].value
