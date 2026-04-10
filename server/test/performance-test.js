import http from 'k6/http';
import { check } from 'k6';

export const options = {
    vus: 10,
    duration: '5s',
};

export default function () {
    const res = http.get('http://localhost:4000/api/products');

    console.log(`Status: ${res.status}`);

    check(res, {
        'status ok': (r) => r.status === 200,
    });
}