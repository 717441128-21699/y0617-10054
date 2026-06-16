import { Request, Response, Router } from 'express';
import { checkoutService } from '../services/checkoutService';
import { productService } from '../services/productService';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

router.post('/calculate', (req: Request, res: Response) => {
  try {
    const { items, userId } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: '购物车不能为空' });
      return;
    }

    const cartItems = productService.buildCartItems(items);
    const result = checkoutService.calculateCart(cartItems);

    res.json({ data: result });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : '计算失败' });
  }
});

router.post('/place-order', (req: Request, res: Response) => {
  try {
    const { items, userId } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: '购物车不能为空' });
      return;
    }

    if (!userId) {
      res.status(400).json({ error: '用户ID不能为空' });
      return;
    }

    const cartItems = productService.buildCartItems(items);
    const order = checkoutService.createOrder(userId, cartItems);

    res.status(201).json({ data: order });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : '下单失败' });
  }
});

export default router;
