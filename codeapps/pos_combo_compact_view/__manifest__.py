{
    'name': 'PoS Combo Compact View',
    'version': '20.0.1.0.0',
    'category': 'Point of Sale',
    'author': 'CodeApps SA',
    'summary': 'Muestra las opciones de los combos en una grilla compacta dentro del PoS',
    'description': """
PoS Combo Compact View
======================

Rediseña el popup de configuración de combos del Punto de Venta
(``ComboConfiguratorPopup``) para mostrar los productos en una grilla de
tarjetas pequeñas:

* Las opciones se distribuyen con ``grid-template-columns: auto-fill``
  (mínimo 110px por tarjeta) en lugar de una única columna.
* Las tarjetas se reducen a 48-60px de alto, con tipografía de 12px.
* Se ocultan las imágenes de producto para ganar espacio.

Sólo aplica al popup de combos; el resto de las pantallas del PoS no se
modifican.
""",
    'depends': ['point_of_sale'],
    'data': [],
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_combo_compact_view/static/src/scss/pos_combo_compact_view.scss',
        ],
    },
    'installable': True,
    'license': 'LGPL-3',
}
