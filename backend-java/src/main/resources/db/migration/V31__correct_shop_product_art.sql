-- Update only untouched seed URLs. Merchant-supplied photographs are preserved.
UPDATE public.menu_items SET image_url = '/shop-assets/tiramisu.png', updated_at = now()
WHERE id = 'shop_tiramisu' AND image_url = '/shop-assets/bakery.png';
UPDATE public.menu_items SET image_url = '/shop-assets/chicken.png', updated_at = now()
WHERE id = 'shop_chicken' AND image_url = '/shop-assets/snack.png';
