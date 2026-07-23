const materials = Array.from({ length: 10000 }, (_, i) => ({
  storage_path: i % 2 === 0 ? `path/${i}` : null
}));

console.time('map + filter');
for (let i = 0; i < 1000; i++) {
  materials.map((m) => m.storage_path).filter(Boolean);
}
console.timeEnd('map + filter');

console.time('flatMap');
for (let i = 0; i < 1000; i++) {
  materials.flatMap((m) => m.storage_path ? [m.storage_path] : []);
}
console.timeEnd('flatMap');

console.time('reduce');
for (let i = 0; i < 1000; i++) {
  materials.reduce((acc, m) => {
    if (m.storage_path) acc.push(m.storage_path);
    return acc;
  }, []);
}
console.timeEnd('reduce');
