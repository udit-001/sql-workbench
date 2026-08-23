/**
 * Built-in sample data shown until LEARN-202 adds fixture loading.
 * Deliberately tiny, hand-written, and fully joinable so every query result
 * is checkable by eye. `shipped_at` NULLs exist so NULL rendering has a
 * real case to prove.
 */
export interface Dataset {
  /** Short identifier shown in the topbar sample-data chip. */
  title: string;
  statements: string[];
  sampleQuery: string;
}

export const DEMO_DATASET: Dataset = {
  title: "demo",
  statements: [
    `CREATE TABLE customers (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      region TEXT,
      signup_date TEXT NOT NULL
    )`,
    `CREATE TABLE products (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      list_price REAL NOT NULL
    )`,
    `CREATE TABLE orders (
      id INTEGER PRIMARY KEY,
      customer_id INTEGER NOT NULL REFERENCES customers(id),
      order_date TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('shipped','pending','cancelled')),
      total_amount REAL NOT NULL,
      shipped_at TEXT
    )`,
    `CREATE TABLE order_items (
      id INTEGER PRIMARY KEY,
      order_id INTEGER NOT NULL REFERENCES orders(id),
      product_id INTEGER NOT NULL REFERENCES products(id),
      quantity INTEGER NOT NULL,
      unit_price REAL NOT NULL
    )`,
    `INSERT INTO customers VALUES
      (1, 'Ada Lovelace',    'europe',        '2023-11-02'),
      (2, 'Grace Hopper',    'north_america', '2023-12-15'),
      (3, 'Rene Descartes',  'europe',        '2024-01-20'),
      (4, 'Kwame Nkrumah',   'africa',        '2024-02-01'),
      (5, 'Li Wei',          'south_asia',    '2024-02-27')`,
    `INSERT INTO products VALUES
      (1, 'Laptop stand',        85.00),
      (2, 'USB-C cable',         19.00),
      (3, 'Mechanical keyboard', 79.00),
      (4, 'Desk lamp',           55.00)`,
    `INSERT INTO orders VALUES
      (1, 1, '2024-01-03', 'shipped',   120.00, '2024-01-05'),
      (2, 2, '2024-01-04', 'shipped',    89.50, '2024-01-06'),
      (3, 1, '2024-01-10', 'cancelled',  45.00, NULL),
      (4, 3, '2024-02-02', 'shipped',   210.25, '2024-02-04'),
      (5, 4, '2024-02-14', 'pending',    62.75, NULL),
      (6, 5, '2024-03-01', 'shipped',   340.00, '2024-03-03'),
      (7, 2, '2024-03-15', 'pending',    18.20, NULL),
      (8, 3, '2024-03-20', 'shipped',   155.40, '2024-03-22')`,
    `INSERT INTO order_items VALUES
      (1, 1, 1, 1,  80.00),
      (2, 1, 2, 2,  20.00),
      (3, 2, 3, 1,  89.50),
      (4, 3, 2, 1,  45.00),
      (5, 4, 1, 2,  80.00),
      (6, 4, 4, 1,  50.25),
      (7, 5, 3, 1,  62.75),
      (8, 6, 4, 2, 170.00),
      (9, 7, 2, 1,  18.20),
      (10, 8, 1, 1, 155.40)`,
  ],
  sampleQuery: `SELECT c.region,
       COUNT(*) AS orders,
       ROUND(SUM(o.total_amount), 2) AS revenue
FROM orders o
JOIN customers c ON c.id = o.customer_id
GROUP BY c.region
ORDER BY revenue DESC;`,
};
