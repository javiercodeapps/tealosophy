# -*- coding: utf-8 -*-

import json
import logging
from urllib.parse import quote

from odoo.http import request, route

from odoo.addons.web.controllers import report

_logger = logging.getLogger(__name__)


class ReportController(report.ReportController):

    @route()
    def report_download(self, data, context=None, token=None, readonly=True):
        _logger.info("[omni_print] report_download override INVOCADO | data=%s | readonly=%s", data, readonly)
        # `readonly` is part of the Odoo 20 core signature; keep it here so the
        # router does not filter it out. Do not forward it: the parent already
        # defaults it to True and older 20.0 builds may not declare it.
        resp = super().report_download(data, context, token)

        requestcontent = json.loads(data)
        url, type_ = requestcontent[0], requestcontent[1]
        _logger.info("[omni_print] datos recibidos | url=%s | type_=%s", url, type_)

        if type_ not in ['qweb-pdf', 'qweb-text']:
            _logger.info("[omni_print] BYPASS: type_=%s no es qweb-pdf/qweb-text; no se añaden cabeceras", type_)
            return resp

        pattern = '/report/pdf/' if type_ == 'qweb-pdf' else '/report/text/'
        reportname = url.split(pattern)[1].split('?')[0]
        docids = None
        if '/' in reportname:
            reportname, docids = reportname.split('/')

        report = request.env['ir.actions.report']._get_report_from_name(reportname)

        resp.headers.add("X-Report-Name", reportname)
        resp.headers.add("X-Report-Title", quote(report.name))
        _logger.info("[omni_print] cabeceras añadidas | reportname=%s | docids=%s", reportname, docids)

        if not docids:
            return resp

        ids = [int(x) for x in docids.split(",") if x.isdigit()]
        records = request.env[report.model].browse(ids)
        doc_names = ",".join([r.display_name for r in records])

        resp.headers.add("X-Report-Docnames", quote(doc_names))

        return resp
