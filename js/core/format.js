export const formatCurrency = (value) => {
    return `$${(value || 0).toLocaleString('es-AR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })}`;
};

export const formatTimestampDateTime = (timestamp, { shortYear = false } = {}) => {
    if (!timestamp?.toDate) return '';
    return timestamp.toDate().toLocaleDateString('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: shortYear ? '2-digit' : 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
};

export const formatTimestampShortDate = (timestamp) => {
    if (!timestamp?.toDate) return '';
    return timestamp.toDate().toLocaleDateString('es-AR', {
        day: '2-digit',
        month: '2-digit'
    });
};

export const timestampToMonthKey = (timestamp) => {
    if (!timestamp?.toDate) return null;
    const date = timestamp.toDate();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${date.getFullYear()}-${month}`;
};

export const monthKeyToLabel = (monthKey) => {
    const [year, month] = monthKey.split('-');
    const date = new Date(Number(year), Number(month) - 1, 1);
    const label = date.toLocaleDateString('es-AR', { month: 'long' });
    return `${label.charAt(0).toUpperCase() + label.slice(1)} ${year}`;
};

export const timestampToLocalDateTimeValue = (timestamp) => {
    if (!timestamp?.toDate) return '';

    const date = timestamp.toDate();
    const pad = (value) => String(value).padStart(2, '0');

    return [
        `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
        `${pad(date.getHours())}:${pad(date.getMinutes())}`
    ].join('T');
};

export const dateToYMD = (date) => {
    const pad = (value) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};
