export function deepEqual(a: unknown, b: unknown) {
    if (a === b) {
        return true;
    } else if (typeof a == 'object' && a != null && typeof b == 'object' && b != null) {
        if (Object.keys(a).length != Object.keys(b).length) return false;

        for (var prop in a) {
            if (b.hasOwnProperty(prop)) {
                if (!deepEqual(a[prop], b[prop])) return false;
            } else return false;
        }

        return true;
    } else {
        return false;
    }
}
