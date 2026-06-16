import { Request, Response, Router } from 'express';
import { productService } from '../services/productService';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  const products = productService.getAllProducts();
  res.json({ data: products });
});

router.get('/:id', (req: Request, res: Response) => {
  const product = productService.getProduct(req.params.id);
  if (!product) {
    res.status(404).json({ error: '商品不存在' });
    return;
  }
  res.json({ data: product });
});

router.post('/', (req: Request, res: Response) => {
  try {
    const { name, price, categoryId, stock } = req.body;

    if (!name || price === undefined || !categoryId || stock === undefined) {
      res.status(400).json({ error: '缺少必要参数' });
      return;
    }

    const product = productService.createProduct({
      name,
      price,
      categoryId,
      stock
    });

    res.status(201).json({ data: product });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : '创建失败' });
  }
});

router.put('/:id', (req: Request, res: Response) => {
  const updated = productService.updateProduct(req.params.id, req.body);
  if (!updated) {
    res.status(404).json({ error: '商品不存在' });
    return;
  }
  res.json({ data: updated });
});

export default router;
