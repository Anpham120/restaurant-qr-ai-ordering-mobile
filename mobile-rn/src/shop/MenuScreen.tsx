import { useMemo, useState } from 'react';
import { FlatList, Modal, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { money, selectedOptions, selectionError } from './logic';
import { Button, Chip, Empty, Field, Message, ProductArt, Quantity, color, s } from './ui';
import type { Menu, Product, ShopConfig } from './types';

export function MenuScreen({
  menu,
  config,
  origin,
  onAdd,
  loading,
  error,
  onRefresh,
}: {
  menu: Menu | null;
  config: ShopConfig | null;
  origin: string;
  onAdd: (product: Product, ids: string[], quantity: number, note: string) => void;
  loading: boolean;
  error: string;
  onRefresh: () => void;
}) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [product, setProduct] = useState<Product | null>(null);
  const products = useMemo(
    () =>
      (menu?.items ?? []).filter(
        (item) =>
          (category === 'all' || item.categoryId === category) &&
          `${item.name} ${item.description}`
            .toLocaleLowerCase('vi')
            .includes(query.toLocaleLowerCase('vi')),
      ),
    [menu, category, query],
  );
  return (
    <>
      <FlatList
        data={products}
        keyExtractor={(item) => item.id}
        contentContainerStyle={s.content}
        refreshing={loading}
        onRefresh={onRefresh}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={{ gap: 24 }}>
            <View style={[s.between, { alignItems: 'flex-start' }]}>
              <View style={s.grow}>
                <Text style={s.label}>MỘT CHÚT NGỌT, MỘT CHÚT VUI</Text>
                <Text style={[s.title, { marginTop: 8 }]}>Hôm nay, bạn{'\n'}thèm gì?</Text>
              </View>
              <View
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 26,
                  backgroundColor: color.coral,
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <Text style={[s.brand, { fontSize: 30, color: color.ink }]}>m.</Text>
              </View>
            </View>
            <View style={[s.card, { backgroundColor: color.forest, borderWidth: 0 }]}>
              <Text style={[s.heading, { color: color.cream }]}>Từ quầy Mây{'\n'}đến tay bạn.</Text>
              <Text style={[s.body, { color: color.pistachio }]}>
                Nước mát, kem ngon và những bát chè vừa ý. Chọn vị của riêng bạn.
              </Text>
              {config ? (
                <Text style={[s.small, { color: color.pistachio }]}>
                  Giao dự kiến {config.estimatedMinutesLow}–{config.estimatedMinutesHigh} phút ·
                  hoặc nhận tại quầy
                </Text>
              ) : null}
            </View>
            <Field
              label="Tìm món bạn thích"
              placeholder="Trà, kem, chè…"
              value={query}
              onChangeText={setQuery}
              returnKeyType="search"
            />
            <View style={s.wrap}>
              <Chip selected={category === 'all'} onPress={() => setCategory('all')}>
                Tất cả
              </Chip>
              {menu?.categories.map((item) => (
                <Chip
                  key={item.categoryId}
                  selected={category === item.categoryId}
                  onPress={() => setCategory(item.categoryId)}
                >
                  {item.name}
                </Chip>
              ))}
            </View>
            <View style={s.between}>
              <Text style={s.heading}>Thực đơn hôm nay</Text>
              <Text style={s.small}>{products.length} món</Text>
            </View>
            {error ? <Message error>{error}</Message> : null}
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <Message>Đang lấy thực đơn từ quán…</Message>
          ) : (
            <Empty
              title={query ? 'Chưa tìm thấy món' : 'Thực đơn chưa sẵn sàng'}
              text={
                query
                  ? 'Thử tên món khác hoặc xem tất cả danh mục.'
                  : 'Kéo xuống hoặc thử lại để cập nhật thực đơn.'
              }
              action={query ? 'Xoá tìm kiếm' : 'Thử lại'}
              onAction={
                query
                  ? () => {
                      setQuery('');
                      setCategory('all');
                    }
                  : onRefresh
              }
            />
          )
        }
        renderItem={({ item }) => (
          <View style={[s.card, { padding: 16 }]}>
            <ProductArt product={item} origin={origin} />
            <View style={s.between}>
              <View style={s.grow}>
                <Text style={s.label}>{item.categoryName}</Text>
                <Text style={[s.heading, { marginTop: 4 }]}>{item.name}</Text>
              </View>
              {!item.isAvailable ? (
                <View style={[s.badge, { backgroundColor: color.surface }]}>
                  <Text style={s.badgeText}>TẠM HẾT</Text>
                </View>
              ) : null}
            </View>
            <Text style={s.small}>{item.description}</Text>
            <View style={s.between}>
              <Text style={s.strong}>{money(item.price)}</Text>
              <Button
                tone="secondary"
                disabled={!item.isAvailable}
                onPress={() => setProduct(item)}
                label={`Chọn ${item.name}`}
              >
                Chọn món +
              </Button>
            </View>
          </View>
        )}
      />
      {product ? (
        <ProductSheet
          product={product}
          origin={origin}
          onClose={() => setProduct(null)}
          onAdd={(ids, quantity, note) => {
            onAdd(product, ids, quantity, note);
            setProduct(null);
          }}
        />
      ) : null}
    </>
  );
}
function ProductSheet({
  product,
  origin,
  onClose,
  onAdd,
}: {
  product: Product;
  origin: string;
  onClose: () => void;
  onAdd: (ids: string[], quantity: number, note: string) => void;
}) {
  const [ids, setIds] = useState<string[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const price =
    product.price + selectedOptions(product, ids).reduce((sum, option) => sum + option.price, 0);
  return (
    <Modal animationType="none" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={s.screen}>
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          <View style={s.between}>
            <Text style={s.label}>PHA THEO Ý BẠN</Text>
            <Button tone="quiet" onPress={onClose}>
              Đóng
            </Button>
          </View>
          <ProductArt product={product} origin={origin} large />
          <Text style={s.title}>{product.name}</Text>
          <Text style={s.body}>{product.description}</Text>
          {product.optionGroups.map((group) => (
            <View key={group.id} style={{ gap: 12 }}>
              <View>
                <Text style={s.heading}>{group.name}</Text>
                <Text style={s.small}>
                  {group.minSelections > 0
                    ? `Bắt buộc · Chọn ${group.minSelections === group.maxSelections ? group.minSelections : `${group.minSelections}–${group.maxSelections}`}`
                    : `Tuỳ chọn · Tối đa ${group.maxSelections}`}
                </Text>
              </View>
              <View style={s.wrap}>
                {group.options.map((option) => (
                  <Chip
                    key={option.id}
                    disabled={!option.isAvailable}
                    selected={ids.includes(option.id)}
                    onPress={() => {
                      setError('');
                      setIds((current) =>
                        current.includes(option.id)
                          ? current.filter((id) => id !== option.id)
                          : group.maxSelections === 1
                            ? [
                                ...current.filter((id) => !group.options.some((o) => o.id === id)),
                                option.id,
                              ]
                            : [...current, option.id],
                      );
                    }}
                  >
                    {option.name}
                    {option.price > 0 ? ` +${money(option.price)}` : ''}
                    {!option.isAvailable ? ' · Hết' : ''}
                  </Chip>
                ))}
              </View>
            </View>
          ))}
          <Field
            label="Lời nhắn cho quầy"
            placeholder="Ví dụ: để riêng topping"
            value={note}
            onChangeText={setNote}
            maxLength={300}
            multiline
          />
          <Quantity
            quantity={quantity}
            label={product.name}
            onChange={(value) => setQuantity(Math.max(1, value))}
          />
          {error ? <Message error>{error}</Message> : null}
          <Button
            onPress={() => {
              const problem = selectionError(product, ids);
              if (problem) {
                setError(problem);
                return;
              }
              onAdd(ids, quantity, note);
            }}
          >
            Thêm vào giỏ · {money(price * quantity)}
          </Button>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
