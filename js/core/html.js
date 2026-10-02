const entityMap = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
};

export const escapeHtml = (value) => {
    return String(value ?? '').replace(/[&<>"']/g, (char) => entityMap[char]);
};

export const escapeAttribute = (value) => {
    return escapeHtml(value).replace(/`/g, '&#96;');
};
