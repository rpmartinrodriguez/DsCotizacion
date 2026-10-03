export const cashMetricsInfo = {
        "media": {
            titulo: "Media (Ingreso Diario Promedio)",
            desc: "Suma total de la facturación dividida la cantidad de cajas registradas.",
            sirve: "Saber el ingreso base que genera un día de trabajo normal.",
            ej: "Si en 10 días se venden $300.000, la media es $30.000 diarios.",
            dec: "Si baja constantemente, indica que es momento de armar campañas o revisar precios."
        },
        "mediana": {
            titulo: "Mediana (El valor central real)",
            desc: "El punto exacto del medio si ordenamos los días del de menor venta al de mayor venta.",
            sirve: "Ignora picos de suerte aislados para darte el valor diario más real de tu mostrador.",
            ej: "Días de $4.000, $5.000 y un evento de $80.000. El promedio engaña, pero la mediana te da $5.000.",
            dec: "Si está muy abajo de la media, significa que dependés de fechas especiales y necesitás mover los días de semana."
        },
        "ticket_promedio": {
            titulo: "Ticket Promedio (Gasto por Cliente)",
            desc: "Facturación total dividida la cantidad de tickets cobrados.",
            sirve: "Mide qué tan efectivo es el vendedor sugiriendo agregados a la compra.",
            ej: "Si 5 clientes gastan $15.000 en total, cada uno dejó en promedio $3.000.",
            dec: "Si es bajo, entrená al personal para ofrecer café, combos o complementos al despachar una porción."
        },
        "vida_util": {
            titulo: "Días de Retención y Vida Útil Promedio",
            desc: "Mide el tiempo promedio (en días) que pasa una porción desde que el repostero la elabora hasta que el ticket se cobra.",
            sirve: "Controlar que la mercadería rote rápido y verificar que se cumpla la regla PEPS (Primero en Entrar, Primero en Salir).",
            ej: "Un promedio de 1.2 días indica una vitrina de altísima rotación y frescura.",
            dec: "Si sube a más de 3 días, corrés riesgo de vencimientos. Reducí el volumen de elaboración de esa línea."
        },
        "desperdicio": {
            titulo: "Nivel de Desperdicio Real",
            desc: "Porcentaje de porciones tiradas por descarte o vencimiento sobre el volumen total producido.",
            sirve: "Detectar pérdidas directas de materia prima.",
            ej: "Hacés 20 tartas, vendés 18 y tirás 2. El desperdicio es del 10%.",
            dec: "Si supera el 5%, la comunicación entre producción y mostrador está fallando. Ajustá las cantidades diarias."
        },
        "moda": {
            titulo: "Productos Estrella (Moda)",
            desc: "Ranking de los artículos que más unidades venden en el mostrador.",
            sirve: "Asegurar el stock de los productos preferidos por tu comunidad.",
            ej: "Si vendés 100 Rogel y 10 Lemon Pie, el Rogel es la moda absoluta.",
            dec: "Tienen prioridad en vitrina, cartelería y exhibición de fotos en redes."
        },
        "horas_pico": {
            titulo: "Horas Pico de Venta (Matriz Temporal)",
            desc: "Histograma que acumula los montos facturados según la hora exacta del ticket.",
            sirve: "Saber a qué hora el local se llena para organizar los turnos del personal.",
            ej: "Verás barras gigantes entre las 16:30hs y las 19:00hs.",
            dec: "Asegurá tener la vitrina 100% armada e impecable media hora antes del pico de ventas."
        },
        "abc": {
            titulo: "Clasificación ABC (Regla de Pareto)",
            desc: "Clasifica tus productos según los ingresos totales: A (80% del dinero), B (15%), C (Solo el 5%).",
            sirve: "No perder tiempo controlando stock de cosas que no mueven la aguja del negocio.",
            ej: "Clase A: Tortas completas. Clase B: Porciones y cafetería. Clase C: Velitas y cajas vacías.",
            dec: "Foco total de control diario en los Clase A. El resto se controla de forma mensual."
        },
        "margen_neto_prod": {
            titulo: "Margen Bruto Actual por Producto",
            desc: "Muestra la ganancia limpia en pesos y porcentaje de cada artículo, restando el costo de receta a la facturación.",
            sirve: "Identificar qué recetas te dejan más ganancias reales y cuáles dan pérdidas.",
            ej: "Una torta que se vende a $5.000 y hoy cuesta $2.000 en insumos deja $3.000 de utilidad bruta sobre materia prima (60%).",
            dec: "Este indicador usa el costo actual de reposición de materias primas. Los gastos operativos y la ganancia neta se analizan en Finanzas."
        },
        "produccion_optima": {
            titulo: "Volumen de Producción Óptimo (Pronóstico)",
            desc: "Analiza el comportamiento histórico exacto del día de la semana actual para sugerir qué cantidad preparar para mañana.",
            sirve: "Producir de forma inteligente para no quedarte sin stock un sábado y que no te sobre mercadería un lunes.",
            ej: "Sabiendo que los sábados se vende el triple de Rogel que los martes, el sistema eleva automáticamente el pronóstico.",
            dec: "Mandar a la cocina la lista sugerida para mitigar el descarte y maximizar la facturación neta."
        },
        "rotacion_inventario": {
            titulo: "Índice de Rotación del Inventario",
            desc: "Velocidad diaria de vaciado de la vitrina (Piezas promedio vendidas por día).",
            sirve: "Monitorear el flujo constante de mercadería fresca.",
            ej: "Una rotación de 45 piezas/día te indica un mostrador sano y activo.",
            dec: "Si cae bruscamente, reduce el stock exhibido para evitar la sensación de 'mercadería estancada'."
        },
        "ventas_diarias": {
            titulo: "Evolución de Ventas",
            desc: "Línea de tendencia de facturación de los últimos 15 días comerciales.",
            sirve: "Ver el rumbo del negocio en el corto plazo.",
            ej: "Detectar si la facturación sube o baja respecto a las semanas previas.",
            dec: "Si la línea tiene tendencia hacia abajo durante más de una semana, activa promociones o alertas."
        },
        "estrategicos": {
            titulo: "Métricas Estratégicas Generales",
            desc: "Monitorea la velocidad del mostrador y el crecimiento inter-período.",
            sirve: "Garantizar la salud del negocio a largo plazo.",
            ej: "Si vendías a 100 clientes y ahora a 120, tu crecimiento es del +20%.",
            dec: "Analizá el Margen Promedio: si es bajo, es hora de remarcar precios porque los costos te están ganando."
        },
        "dispersion": {
            titulo: "Medidas de Dispersión",
            desc: "Miden qué tan caóticas o estables son tus ventas usando Varianza y Desviación Estándar.",
            sirve: "Para saber qué tan predecible es tu negocio de cara al futuro.",
            ej: "Un local estable vende $10.000 siempre. Uno inestable vende $2.000 un lunes y $35.000 un sábado.",
            dec: "Si la desviación estándar es muy alta, tu caja es volátil. Mantené un colchón de fondo inicial más grande."
        }
    };
