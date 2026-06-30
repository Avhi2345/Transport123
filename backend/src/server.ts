import app from './app';

const PORT = process.env.PORT || 8000;

app.listen(PORT, () => {
  console.log(`=================================`);
  console.log(`  Transport Service API is Live! `);
  console.log(`  Running on http://localhost:${PORT}`);
  console.log(`=================================`);
});
