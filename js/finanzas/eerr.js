
import {
    getFirestore, collection, query, where, getDocs, addDoc, updateDoc,
    deleteDoc, doc, Timestamp, writeBatch
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { calculateEERR, monthFromDate, EERR_CATEGORIES } from "./eerr-engine.js?v=2";
import { formatCurrency } from "../core/format.js";
import { escapeHtml, escapeAttribute } from "../core/html.js";
import { parseARS } from "../core/money.js?v=2";

export function setupEstadoResultados(app) {
    const db = getFirestore(app);
    const auth = getAuth(app);
    const expenses = collection(db, 'gastosOperativos');
    const tabs = [...document.querySelectorAll('[data-eerr-tab]')];

    const monthResult = document.getElementById('eerr-mes');
    const monthExpenses = document.getElementById('eerr-mes-gastos');
    const report = document.getElementById('eerr-reporte');
    const kpis = document.getElementById('eerr-kpis');
    const quality = document.getElementById('eerr-calidad');
    const status = document.getElementById('eerr-estado');
    const list = document.getElementById('eerr-gastos-lista');
    const expensesStatus = document.getElementById('eerr-gastos-estado');
    const form = document.getElementById('eerr-gasto-form');
    const expenseId = document.getElementById('eerr-gasto-id');
    const concept = document.getElementById('eerr-gasto-concepto');
    const category = document.getElementById('eerr-gasto-categoria');
    const type = document.getElementById('eerr-gasto-tipo');
    const amount = document.getElementById('eerr-gasto-monto');
    const note = document.getElementById('eerr-gasto-nota');
    const save = document.getElementById('eerr-gasto-guardar');
    const cancel = document.getElementById('eerr-gasto-cancelar');
    const copy = document.getElementById('eerr-copiar-anterior');

    // Activar SOLO cuando se hayan desplegado y probado las reglas
    // Firestore y se haya ejecutado una prueba con caja/saldos controlados.
    const FIREBASE_FINANCIAL_RULES_VERIFIED = false;
    const previewReadOnly = !FIREBASE_FINANCIAL_RULES_VERIFIED
        || window.location.hostname.startsWith('deploy-preview-');
    const previewNotice = document.getElementById('eerr-preview-notice');
    if (previewNotice) previewNotice.hidden = !previewReadOnly;
    if (previewReadOnly) {
        form?.querySelectorAll('input, select, button').forEach(control => {
            control.disabled = true;
        });
        if (copy) copy.disabled = true;
    }

    let loadedExpenses = [];
    let requestId = 0;

    const validMonth = value => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value || ''));
    const activeMonth = () => validMonth(monthResult?.value) ? monthResult.value : monthFromDate(new Date());
    const amountText = value => formatCurrency(Number(value) || 0);

    const previousMonth = month => {
        const [year, number] = month.split('-').map(Number);
        return `${year - (number === 1 ? 1 : 0)}-${String(number === 1 ? 12 : number - 1).padStart(2, '0')}`;
    };

    const showTab = tab => {
        const selected = ['resultados', 'gastos', 'anterior'].includes(tab) ? tab : 'resultados';
        tabs.forEach(button => {
            const active = button.dataset.eerrTab === selected;
            button.classList.toggle('is-active', active);
            button.setAttribute('aria-selected', String(active));
        });
        ['resultados', 'gastos', 'anterior'].forEach(key => {
            const panel = document.getElementById(`eerr-tab-${key}`);
            if (panel) panel.hidden = key !== selected;
        });
        if (selected === 'gastos') {
            monthExpenses.value = activeMonth();
            loadExpenses();
        } else if (selected === 'resultados') {
            refreshReport();
        }
    };

    const resetExpenseForm = () => {
        if (!form) return;
        form.reset();
        expenseId.value = '';
        save.textContent = 'Agregar gasto';
        cancel.hidden = true;
        concept.focus();
    };

    const renderExpenseList = () => {
        if (!list) return;
        if (!loadedExpenses.length) {
            list.innerHTML = '<div class="ds-expense-empty">Todavía no hay conceptos cargados para este mes.</div>';
            return;
        }

        const groups = new Map();
        loadedExpenses.forEach(expense => {
            const key = EERR_CATEGORIES.includes(expense.categoria) ? expense.categoria : 'Otros';
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(expense);
        });

        list.innerHTML = EERR_CATEGORIES.filter(key => groups.has(key)).map(key => {
            const data = groups.get(key);
            const total = data.reduce((sum, item) => sum + Number(item.monto || 0), 0);

            return `
                <details class="ds-eerr-category" open>
                    <summary><span>${escapeHtml(key)}</span><strong>${amountText(total)}</strong></summary>
                    <div class="ds-expense-rows">
                        ${data.map(expense => `
                            <div class="ds-expense-line">
                                <div>
                                    <strong>${escapeHtml(expense.concepto || 'Sin concepto')}</strong>
                                    <small>${escapeHtml(expense.tipo || 'fijo')} ${expense.nota ? '· ' + escapeHtml(expense.nota) : ''}</small>
                                </div>
                                <b>${amountText(expense.monto)}</b>
                                ${previewReadOnly ? '' : `
                                    <button type="button" data-expense-action="edit" data-id="${escapeAttribute(expense.id)}">Editar</button>
                                    <button type="button" data-expense-action="delete" data-id="${escapeAttribute(expense.id)}" class="is-danger">Eliminar</button>
                                `}
                            </div>
                        `).join('')}
                    </div>
                </details>
            `;
        }).join('');
    };

    const loadExpenses = async () => {
        if (!monthExpenses || !validMonth(monthExpenses.value)) return;
        const request = ++requestId;
        if (expensesStatus) expensesStatus.textContent = 'Cargando conceptos…';

        try {
            const snapshot = await getDocs(query(expenses, where('mes', '==', monthExpenses.value)));
            if (request !== requestId) return;
            loadedExpenses = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
            loadedExpenses.sort((a, b) =>
                String(a.concepto || '').localeCompare(String(b.concepto || ''), 'es')
            );
            renderExpenseList();
            if (expensesStatus) {
                const total = loadedExpenses.reduce((sum, item) => sum + Number(item.monto || 0), 0);
                expensesStatus.textContent = `${loadedExpenses.length} conceptos · Total ${amountText(total)}`;
            }
        } catch (error) {
            console.error('No se pudieron leer los gastos mensuales:', error);
            if (expensesStatus) expensesStatus.textContent = 'Error al cargar los conceptos. Verificá permisos y conexión.';
        }
    };

    const refreshReport = async () => {
        const month = activeMonth();
        if (status) status.textContent = `Calculando EERR de ${month}…`;
        if (report) report.innerHTML = '';
        if (kpis) kpis.innerHTML = '';

        const [y, m] = month.split('-').map(Number);
        const from = new Date(y, m - 1, 1);
        const to = new Date(y, m, 1);
        try {
            const [salesSnap, boxesSnap, recipesSnap, materialsSnap, expensesSnap] = await Promise.all([
                getDocs(query(collection(db, 'ventasMostrador'),
                    where('fecha', '>=', Timestamp.fromDate(from)),
                    where('fecha', '<', Timestamp.fromDate(to))
                )),
                getDocs(collection(db, 'cajas')),
                getDocs(collection(db, 'recetas')),
                getDocs(collection(db, 'materiasPrimas')),
                getDocs(query(expenses, where('mes', '==', month)))
            ]);

            if (month !== activeMonth()) return;

            const extract = snapshot => snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
            const result = calculateEERR({
                month,
                sales: extract(salesSnap),
                boxes: extract(boxesSnap),
                recipes: extract(recipesSnap),
                materials: extract(materialsSnap),
                expenses: extract(expensesSnap)
            });
            renderReport(result);
        } catch (error) {
            console.error('Error EERR:', error);
            if (status) status.textContent = 'No se pudo calcular el EERR. Verificá permisos de Finanzas, conexión y Firestore.';
        }
    };

    const line = (label, value, className = '') => `
        <div class="ds-eerr-line ${className}">
            <span>${escapeHtml(label)}</span><strong>${value === null ? 'No calculable' : amountText(value)}</strong>
        </div>`;

    const renderReport = result => {
        if (!report || !kpis) return;
        const resultText = result.operatingResult === null
            ? 'Costo incompleto'
            : amountText(result.operatingResult);
        const resultLabel = result.dataQuality === 'documentado'
            ? 'Costos documentados'
            : result.dataQuality === 'estimado'
                ? 'Contiene costos estimados'
                : 'Faltan costos';

        kpis.innerHTML = `
            <div><small>Ingresos registrados</small><strong>${amountText(result.revenue)}</strong></div>
            <div><small>Costo de producción</small><strong>${amountText(result.totalCost)}</strong></div>
            <div><small>Gastos operativos</small><strong>${amountText(result.expenseTotal)}</strong></div>
            <div><small>Resultado operativo</small><strong>${resultText}</strong></div>
        `;

        report.innerHTML = `
            ${line('(+) Ventas de Mostrador', result.revenue, 'is-strong')}
            ${line('(-) Costo de ventas documentado', result.documentedCost)}
            ${line('(-) Costo de ventas estimado (histórico)', result.estimatedCost)}
            ${line('(=) Resultado bruto', result.grossResult, 'is-subtotal')}
            <h3 class="ds-eerr-expenses-header">
                Gastos del mes
                <small>Fijos: ${amountText(result.fixedExpenses)} · Variables: ${amountText(result.variableExpenses)}</small>
            </h3>
            ${result.categoryGroups.length
                ? result.categoryGroups.map(group => `
                    <details class="ds-eerr-category">
                        <summary><span>${escapeHtml(group.name)}</span><strong>−${amountText(group.total)}</strong></summary>
                        <div class="ds-eerr-category-details">
                            ${group.entries.map(entry => `
                                <div><span>${escapeHtml(entry.concepto || 'Sin concepto')}</span><strong>${amountText(entry.monto)}</strong></div>
                            `).join('')}
                        </div>
                    </details>
                `).join('')
                : '<p class="ds-finance-hint">Todavía no cargaste gastos operativos para este mes.</p>'}
            ${line('(-) Total gastos operativos', result.expenseTotal, 'is-subtotal')}
            ${line('(=) RESULTADO OPERATIVO', result.operatingResult, 'is-final')}
        `;

        if (quality) {
            const coverage = result.coverage === null
                ? 'sin ventas para calcular'
                : `${result.coverage.toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`;

            quality.textContent = `Calidad de datos: ${resultLabel}. `
                + `Costo histórico congelado sobre ${coverage} de las ventas. `
                + `${result.salesCount} tickets. `
                + (result.hasEstimatedCost
                    ? `Parte del costo histórico (${amountText(result.estimatedCost)}) se estimó con recetas y costos actuales, no del mes original. `
                    : '')
                + (result.hasUnknownCost
                    ? `Faltan costos para ingresos por ${amountText(result.missingRevenue)}: no se muestra un resultado final engañoso. `
                    : '')
                + 'El total no incluye ingresos de presupuestos independientes sin conciliación de duplicados.';
        }
        if (status) status.textContent = `EERR del mes ${result.month} · ${resultLabel.toLowerCase()}.`;
    };

    tabs.forEach(tab => tab.addEventListener('click', () =>
        showTab(tab.dataset.eerrTab || 'resultados')
    ));

    monthResult?.addEventListener('change', () => {
        if (!validMonth(monthResult.value)) return;
        if (monthExpenses) monthExpenses.value = monthResult.value;
        refreshReport();
    });

    monthExpenses?.addEventListener('change', () => {
        if (!validMonth(monthExpenses.value)) return;
        monthResult.value = monthExpenses.value;
        resetExpenseForm();
        loadExpenses();
    });

    cancel?.addEventListener('click', resetExpenseForm);
    list?.addEventListener('click', async event => {
        if (previewReadOnly) return;
        const button = event.target.closest('[data-expense-action]');
        if (!button) return;
        const row = loadedExpenses.find(item => item.id === button.dataset.id);
        if (!row) return;

        if (button.dataset.expenseAction === 'edit') {
            expenseId.value = row.id;
            concept.value = row.concepto || '';
            category.value = EERR_CATEGORIES.includes(row.categoria) ? row.categoria : 'Otros';
            type.value = row.tipo || 'fijo';
            amount.value = Number(row.monto || 0);
            note.value = row.nota || '';
            save.textContent = 'Guardar cambios';
            cancel.hidden = false;
            form.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else if (button.dataset.expenseAction === 'delete') {
            if (!window.confirm(`¿Eliminar "${row.concepto}" por ${amountText(row.monto)} de ${row.mes}?\nLa operación no se puede deshacer.`)) return;
            button.disabled = true;
            try {
                await deleteDoc(doc(db, 'gastosOperativos', row.id));
                await loadExpenses();
            } catch (error) {
                console.error(error);
                alert('No se pudo eliminar el gasto.');
                button.disabled = false;
            }
        }
    });

    form?.addEventListener('submit', async event => {
        event.preventDefault();
        if (previewReadOnly) {
            alert('Vista previa de solo lectura: no se modificarán los gastos reales.');
            return;
        }
        const month = monthExpenses?.value;
        const value = parseARS(amount.value);

        if (!validMonth(month)
            || !concept.value.trim()
            || !Number.isFinite(value)
            || value <= 0
            || !EERR_CATEGORIES.includes(category.value)) {
            alert('Verificá mes, categoría, concepto e importe.');
            return;
        }

        const payload = {
            mes: month,
            concepto: concept.value.trim(),
            categoria: category.value,
            tipo: type.value === 'variable' ? 'variable' : 'fijo',
            monto: Math.round(value * 100) / 100,
            nota: note.value.trim(),
            updatedAt: Timestamp.now(),
            updatedBy: auth.currentUser?.uid || ''
        };

        save.disabled = true;
        try {
            if (expenseId.value) {
                await updateDoc(doc(db, 'gastosOperativos', expenseId.value), payload);
            } else {
                await addDoc(expenses, {
                    ...payload,
                    createdAt: Timestamp.now(),
                    createdBy: auth.currentUser?.uid || ''
                });
            }
            resetExpenseForm();
            await loadExpenses();
        } catch (error) {
            console.error('Error guardando gasto:', error);
            alert('No se pudo guardar el gasto. Verificá permisos y conexión.');
        } finally {
            save.disabled = false;
        }
    });

    copy?.addEventListener('click', async () => {
        if (previewReadOnly) return;
        if (!validMonth(monthExpenses?.value)) return;
        const targetMonth = monthExpenses.value;
        const sourceMonth = previousMonth(targetMonth);
        copy.disabled = true;
        try {
            const snapshot = await getDocs(query(expenses, where('mes', '==', sourceMonth)));
            const from = snapshot.docs.map(item => item.data());
            const currentKeys = new Set(loadedExpenses.map(item =>
                `${item.categoria}|${String(item.concepto || '').toLowerCase().trim()}`
            ));
            const missing = from.filter(item => !currentKeys.has(
                `${item.categoria}|${String(item.concepto || '').toLowerCase().trim()}`
            ));

            if (!missing.length) {
                alert('No hay nuevos conceptos para copiar del mes anterior.');
                return;
            }
            if (!window.confirm(`¿Copiar ${missing.length} conceptos desde ${sourceMonth} a ${targetMonth} con los mismos montos? Revisá los importes después.`)) return;

            const batch = writeBatch(db);
            missing.slice(0, 450).forEach(item => {
                const ref = doc(expenses);
                batch.set(ref, {
                    mes: targetMonth,
                    concepto: item.concepto,
                    categoria: item.categoria,
                    tipo: item.tipo || 'fijo',
                    monto: Number(item.monto) || 0,
                    nota: item.nota || '',
                    createdAt: Timestamp.now(),
                    updatedAt: Timestamp.now(),
                    createdBy: auth.currentUser?.uid || ''
                });
            });
            await batch.commit();
            await loadExpenses();
            alert(`Copiados ${Math.min(missing.length, 450)} conceptos. Revisá montos y categorías.`);
        } catch (error) {
            console.error('Error copiando gastos:', error);
            alert('No se pudo copiar los gastos del mes anterior.');
        } finally {
            copy.disabled = false;
        }
    });

    const currentMonth = monthFromDate(new Date());
    if (monthResult) monthResult.value = currentMonth;
    if (monthExpenses) monthExpenses.value = currentMonth;
    refreshReport();
}
