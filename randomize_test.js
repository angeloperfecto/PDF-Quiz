const questions = [
  { questionText: "Q1", options: ["O1A", "O1B", "O1C", "O1D"], correctIndex: 0 },
  { questionText: "Q2", options: ["O2A", "O2B", "O2C", "O2D"], correctIndex: 1 }
];
let indices = questions.map((_, i) => i);
indices = indices.sort(() => Math.random() - 0.5);

console.log(indices);
