const payload = {
  messages: [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: "Explain quantum mechanics in simple terms." }
  ],
  temperature: 0.7,
  max_tokens: 1000
};

const retries = 3;

function withRepeatedStringify() {
  let result = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const body = JSON.stringify(payload);
    result = body;
  }
  return result;
}

function withSingleStringify() {
  const body = JSON.stringify(payload);
  let result = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    result = body;
  }
  return result;
}

const ITERATIONS = 1000000;

console.log("Measuring Repeated Stringify...");
const start1 = performance.now();
for (let i = 0; i < ITERATIONS; i++) {
  withRepeatedStringify();
}
const end1 = performance.now();
const time1 = end1 - start1;
console.log(`Repeated Stringify Time: ${time1.toFixed(2)} ms`);

console.log("Measuring Single Stringify...");
const start2 = performance.now();
for (let i = 0; i < ITERATIONS; i++) {
  withSingleStringify();
}
const end2 = performance.now();
const time2 = end2 - start2;
console.log(`Single Stringify Time: ${time2.toFixed(2)} ms`);
console.log(`Improvement: ${((time1 - time2) / time1 * 100).toFixed(2)}% faster`);
