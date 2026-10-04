/**
 * Parseo monetario para ARS. Acepta agrupación de miles argentina y
 * decimal con coma o punto. Rechaza más de dos decimales o grupos inválidos.
 * Ejemplos: 60000, 60.000, 60.000,50, 60000.50.
 */
export const parseARS = (value) => {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : NaN;
    }
    const raw = String(value ?? '')
        .trim()
        .replace(/[$\s\u00a0]/g, '');

    if (!raw || !/^[0-9.,]+$/.test(raw)) return NaN;

    const dotCount = (raw.match(/\./g) || []).length;
    const commaCount = (raw.match(/,/g) || []).length;
    const lastDot = raw.lastIndexOf('.');
    const lastComma = raw.lastIndexOf(',');

    if (dotCount && commaCount) {
        const decimalSep = lastDot > lastComma ? '.' : ',';
        const groupSep = decimalSep === '.' ? ',' : '.';
        const pos = raw.lastIndexOf(decimalSep);
        const integerPart = raw.slice(0, pos);
        const decimals = raw.slice(pos + 1);
        if (!/^[0-9]{1,2}$/.test(decimals)) return NaN;

        // El separador de miles es válido solo en grupos de tres.
        const groups = integerPart.split(groupSep);
        if (groups.length > 1
            && (!/^[0-9]{1,3}$/.test(groups[0])
                || groups.slice(1).some(group => !/^[0-9]{3}$/.test(group)))) {
            return NaN;
        }
        if (groups.some(group => !/^[0-9]+$/.test(group))) return NaN;
        return Number(groups.join('') + '.' + decimals);
    }

    const separator = dotCount ? '.' : commaCount ? ',' : null;
    if (!separator) return Number(raw);
    const parts = raw.split(separator);

    if (parts.length > 2) {
        if (!/^[0-9]{1,3}$/.test(parts[0])
            || parts.slice(1).some(part => !/^[0-9]{3}$/.test(part))) return NaN;
        return Number(parts.join(''));
    }

    const [whole, fraction] = parts;
    if (!/^[0-9]+$/.test(whole) || !/^[0-9]+$/.test(fraction)) return NaN;

    if (fraction.length === 3 && whole.length <= 3) {
        return Number(whole + fraction);
    }
    if (fraction.length > 2) return NaN;

    return Number(whole + '.' + fraction);
};
