export type CatalogProduct = {
  id: string;
  name: string;
  brand: string;
  description: string;
  price: string | number;
  discountPrice: string | number | null;
  category?: { name: string } | null;
  seller?: { businessName: string } | null;
  images?: { id?: string; imageUrl: string; isPrimary: boolean; sortOrder: number }[];
};

export const productPhotos: Record<string, string> = {
  Samsung: "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=900&q=85",
  Sony: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=900&q=85",
  Apple: "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=900&q=85",
  Shirts: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=900&q=85",
  Pants: "https://images.unsplash.com/photo-1542272604-787c3835535d?auto=format&fit=crop&w=900&q=85",
  Sneakers: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=85",
  Perfumes: "https://images.unsplash.com/photo-1594035910387-fea47794261f?auto=format&fit=crop&w=900&q=85",
  "Men's Collection": "https://images.unsplash.com/photo-1516826957135-700dedea698c?auto=format&fit=crop&w=900&q=85",
  "Women's Collection": "https://images.unsplash.com/photo-1595777457583-95e059d581b8?auto=format&fit=crop&w=900&q=85",
  Bags: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=900&q=85",
};

export function getProductImage(product: CatalogProduct) {
  return product.images?.find((image) => image.isPrimary)?.imageUrl ||
    product.images?.[0]?.imageUrl ||
    productPhotos[product.brand] ||
    productPhotos[product.category?.name || ""] ||
    productPhotos.Samsung;
}

export function formatPrice(value: string | number) {
  return `৳${Number(value).toLocaleString("en-BD", { maximumFractionDigits: 0 })}`;
}
