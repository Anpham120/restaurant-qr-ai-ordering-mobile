param(
  [string]$BaseUrl = 'http://127.0.0.1:8081',
  [string]$EnvironmentFile = "$PSScriptRoot/../../tools/runtime/shop-local.env"
)

$ErrorActionPreference = 'Stop'
if (([Uri]$BaseUrl).Host -notin @('localhost', '127.0.0.1')) { throw 'This fixture creates test orders and must run locally.' }
$settings = @{}
Get-Content -LiteralPath $EnvironmentFile | ForEach-Object {
  $pair = $_ -split '=', 2
  if ($pair.Length -eq 2) { $settings[$pair[0]] = $pair[1] }
}
$script:checks = 0
function Call-Api([string]$Method, [string]$Path, $Body = $null, [hashtable]$Headers = @{}, [int]$Expected = 200) {
  $parameters = @{ Uri = "$BaseUrl$Path"; Method = $Method; Headers = $Headers; SkipHttpErrorCheck = $true }
  if ($null -ne $Body) {
    $parameters.ContentType = 'application/json; charset=utf-8'
    $parameters.Body = $Body | ConvertTo-Json -Depth 15 -Compress
  }
  $response = Invoke-WebRequest @parameters
  if ([int]$response.StatusCode -ne $Expected) {
    throw "$Method $Path expected $Expected, got $($response.StatusCode): $($response.Content)"
  }
  $script:checks++
  if ($response.Headers.'Content-Type' -like '*application/json*' -and $response.Content) {
    return $response.Content | ConvertFrom-Json
  }
}
function Assert-Equal($Actual, $Expected, [string]$Message) {
  if ($Actual -ne $Expected) { throw "$Message expected '$Expected', got '$Actual'" }
  $script:checks++
}
function Login([string]$Email) {
  $result = Call-Api POST '/api/auth/login' @{ identifier = $Email; password = $settings.ADMIN_BOOTSTRAP_PASSWORD }
  return @{ Authorization = "Bearer $($result.accessToken)" }
}

$admin = Login $settings.ADMIN_BOOTSTRAP_EMAIL
$run = [Guid]::NewGuid().ToString('N').Substring(0, 8)
$staff = @{}
foreach ($role in @('CounterStaff', 'Courier', 'Kitchen')) {
  $email = "smoke.$run.$role@may.local"
  $user = Call-Api POST '/api/users' @{ fullName = "Smoke $role"; email = $email; password = $settings.ADMIN_BOOTSTRAP_PASSWORD; role = $role } $admin 201
  $staff[$role] = @{ userId = $user.userId; headers = (Login $email) }
}
$secondEmail = "smoke.$run.other@may.local"
$second = Call-Api POST '/api/users' @{ fullName = 'Smoke Other Courier'; email = $secondEmail; password = $settings.ADMIN_BOOTSTRAP_PASSWORD; role = 'Courier' } $admin 201
$otherCourier = Login $secondEmail
$counter = $staff.CounterStaff.headers
$courier = $staff.Courier.headers
$catalog = Call-Api GET '/api/shop/menu'
Assert-Equal $catalog.items.Count 16 'Seeded shop catalog'
$config = Call-Api GET '/api/shop/config'
$null = Call-Api PUT '/api/shop/config' $config $counter 403
$storedConfig = Call-Api PUT '/api/shop/config' $config $admin
Assert-Equal $storedConfig.shippingPerKm $config.shippingPerKm 'Shipping settings persist'
$null = Call-Api GET '/shop-assets/matcha.png'
$latitude = [double]$config.latitude + 0.06
$longitude = [double]$config.longitude
$quote = Call-Api POST '/api/shop/quote' @{ latitude = $latitude; longitude = $longitude }
Assert-Equal $quote.deliveryFee 8000 'Radius-based delivery quote'
$item = $catalog.items | Where-Object id -eq 'shop_matcha_latte'
$updatedItem = Call-Api PUT "/api/admin/menu-items/$($item.id)" $item $admin
Assert-Equal $updatedItem.optionGroups.Count $item.optionGroups.Count 'Admin modifiers round-trip'
$options = @($item.optionGroups | Where-Object minSelections -gt 0 | ForEach-Object { $_.options[0].id })
$orderBody = @{
  orderType = 'Delivery'
  items = @(@{ menuItemId = $item.id; quantity = 1; optionIds = $options; note = 'Smoke test' })
  deliveryDetails = @{ recipientName = "Smoke $run"; phoneNumber = '0901234567'; address = 'Địa chỉ kiểm thử Hà Nội'; latitude = $latitude; longitude = $longitude }
  expectedTotalAmount = 1
}
$key = "smoke-$run-delivery"
$customer = @{ 'Idempotency-Key' = $key }
$stale = Call-Api POST '/api/orders' $orderBody $customer 409
Assert-Equal $stale.error.code 'ORDER_TOTAL_CHANGED' 'Price tampering rejected'
$orderBody.expectedTotalAmount = [decimal]$item.price + [decimal]$quote.deliveryFee
$order = Call-Api POST '/api/orders' $orderBody $customer 201
Assert-Equal $order.totalAmount $orderBody.expectedTotalAmount 'Server total includes shipping'
Assert-Equal $order.deliveryFee $quote.deliveryFee 'Shipping snapshotted'
$replay = Call-Api POST '/api/orders' $orderBody $customer 201
Assert-Equal $replay.orderCode $order.orderCode 'Order idempotency'
$customer['X-Order-Token'] = $order.customerAccessToken
$code = $order.orderCode
$null = Call-Api PATCH "/api/orders/$code/status" @{ status = 'Preparing' } $counter 400
$null = Call-Api POST "/api/orders/$code/payment/request" @{ method = 'COD' } $customer
$null = Call-Api POST "/api/orders/$code/items/$($order.items[0].orderItemId)/cancel" @{} $customer 409
$null = Call-Api PATCH "/api/orders/$code/status" @{ status = 'Preparing' } $counter 400
$null = Call-Api POST "/api/orders/$code/accept-cod" @{} $staff.Kitchen.headers 403
$accepted = Call-Api POST "/api/orders/$code/accept-cod" @{} $counter
Assert-Equal $accepted.codAccepted $true 'Counter acceptance recorded'
$null = Call-Api PATCH "/api/orders/$code/status" @{ status = 'Preparing' } $counter
$ready = Call-Api PATCH "/api/orders/$code/status" @{ status = 'Ready' } $counter
Assert-Equal $ready.fulfillmentStatus 'ReadyForDispatch' 'Ready dispatch queue'
$null = Call-Api POST "/api/orders/$code/dispatch" @{ courierId = $staff.Courier.userId } $counter
$null = Call-Api PATCH "/api/delivery/orders/$code/status" @{ status = 'OutForDelivery' } $otherCourier 404
$null = Call-Api GET '/api/orders' $null $courier 403
$assigned = Call-Api GET '/api/delivery/orders' $null $courier
Assert-Equal $assigned.orders[0].orderCode $code 'Courier assigned list'
$null = Call-Api PATCH "/api/delivery/orders/$code/status" @{ status = 'Delivered'; amountCollected = $order.totalAmount } $courier 400
$null = Call-Api PATCH "/api/delivery/orders/$code/status" @{ status = 'OutForDelivery' } $courier
$null = Call-Api PATCH "/api/delivery/orders/$code/status" @{ status = 'Failed' } $courier 400
$failed = Call-Api PATCH "/api/delivery/orders/$code/status" @{ status = 'Failed'; note = 'Smoke khách đổi thời gian' } $courier
Assert-Equal $failed.paymentStatus 'Pending' 'Failed delivery does not settle COD'
$null = Call-Api POST "/api/orders/$code/dispatch" @{ courierId = $staff.Courier.userId } $counter
$null = Call-Api PATCH "/api/delivery/orders/$code/status" @{ status = 'OutForDelivery' } $courier
$null = Call-Api PATCH "/api/delivery/orders/$code/status" @{ status = 'Delivered'; amountCollected = $item.price } $courier 400
$delivered = Call-Api PATCH "/api/delivery/orders/$code/status" @{ status = 'Delivered'; amountCollected = $order.totalAmount } $courier
Assert-Equal $delivered.status 'Completed' 'Delivery completes order'
Assert-Equal $delivered.paymentStatus 'Confirmed' 'COD confirmed atomically'
Assert-Equal $delivered.fulfillmentStatus 'Delivered' 'Courier delivery state'
$null = Call-Api PATCH "/api/delivery/orders/$code/status" @{ status = 'Delivered'; amountCollected = $order.totalAmount } $courier

$pickupHeaders = @{ 'Idempotency-Key' = "smoke-$run-pickup" }
$pickup = Call-Api POST '/api/orders' @{
  orderType = 'Pickup'
  deliveryDetails = @{ recipientName = 'Smoke Pickup'; phoneNumber = '0901234567' }
  items = @(@{ menuItemId = 'shop_che_pomelo'; quantity = 1; optionIds = @() })
  expectedTotalAmount = 29000
} $pickupHeaders 201
Assert-Equal $pickup.deliveryFee 0 'Pickup never charged shipping'
$pickupHeaders['X-Order-Token'] = $pickup.customerAccessToken
$pickupCode = $pickup.orderCode
$null = Call-Api POST "/api/orders/$pickupCode/payment/request" @{ method = 'COD' } $pickupHeaders
$null = Call-Api POST "/api/orders/$pickupCode/payment/confirm" @{ note = 'Smoke cash at counter' } $counter
foreach ($next in @('Preparing', 'Ready', 'Served', 'Completed')) {
  $null = Call-Api PATCH "/api/orders/$pickupCode/status" @{ status = $next } $counter
}
$null = Call-Api GET "/api/orders/$pickupCode" $null @{} 404
"PASS: $script:checks HTTP/business assertions. Delivery $code; Pickup $pickupCode. Test accounts/orders remain in this local fixture database."
