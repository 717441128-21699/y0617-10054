import { Product, CartItem } from '../types';
import { dataStore } from '../store/dataStore';

export interface CreateProductParams {
  name: string;
  price: number;
  categoryId: string;
  stock: number;
}

export class ProductService {
  createProduct(params: CreateProductParams): Product {
    return dataStore.addProduct(params);
  }

  getProduct(id: string): Product | undefined {
    return dataStore.getProduct(id);
  }

  getAllProducts(): Product[] {
    return dataStore.getAllProducts();
  }

  updateProduct(id: string, updates: Partial<Product>): Product | undefined {
    return dataStore.updateProduct(id, updates);
  }

  buildCartItems(items: Array<{ productId: string; quantity: number }>): CartItem[] {
    const cartItems: CartItem[] = [];

    for (const item of items) {
      const product = dataStore.getProduct(item.productId);
      if (!product) {
        throw new Error(`商品不存在: ${item.productId}`);
      }

      cartItems.push({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: product.price,
        product
      });
    }

    return cartItems;
  }
}

export const productService = new ProductService();
