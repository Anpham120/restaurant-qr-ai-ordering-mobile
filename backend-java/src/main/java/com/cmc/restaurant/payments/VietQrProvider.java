package com.cmc.restaurant.payments;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.EncodeHintType;
import com.google.zxing.WriterException;
import com.google.zxing.client.j2se.MatrixToImageWriter;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Locale;
import java.util.Map;
import org.springframework.stereotype.Component;

/**
 * Mirrors {@code QrCoderVietQrProvider} (.NET) — builds the img.vietqr.io quick link and renders
 * it as a PNG data URI. Same as the original, this only <em>draws</em> a QR: nothing here verifies
 * that a transfer actually happened, which is exactly the gap issue #12 (Casso webhook) closes.
 *
 * <p>QR rendering uses ZXing instead of QRCoder (no .NET library on the JVM). Kept
 * behaviourally identical where it is observable: same ECC level Q, same 8-pixel module size, same
 * PNG-as-base64-data-URI output.
 */
@Component
public class VietQrProvider {

	private static final int MODULE_PIXELS = 8;
	private static final int QUIET_ZONE_MODULES = 4;

	private final VietQrProperties properties;

	public VietQrProvider(VietQrProperties properties) {
		this.properties = properties;
	}

	public record VietQrPayload(
			BigDecimal amount, String transferContent, String bankId, String accountNumber, String accountName,
			String quickLink, String qrPayload, String qrImageDataUri) {
	}

	/** @throws IllegalStateException when bank details are unconfigured — the caller maps this to
	 *     {@code 400 VIETQR_CONFIG_MISSING}, same as the .NET endpoint. */
	public VietQrPayload createPayload(String orderCode, BigDecimal amount) {
		ensureConfigured();

		String transferContent = ("CMC " + orderCode).toUpperCase(Locale.ROOT);
		// Truncate, not round: mirrors decimal.Truncate in .NET, so 110000.99 transfers as 110000.
		String amountText = amount.setScale(0, RoundingMode.DOWN).toPlainString();
		String quickLink = "https://img.vietqr.io/image/"
				+ encode(properties.bankId()) + "-" + encode(properties.accountNumber()) + "-"
				+ encode(properties.template()) + ".png"
				+ "?amount=" + encode(amountText)
				+ "&addInfo=" + encode(transferContent)
				+ "&accountName=" + encode(properties.accountName());

		return new VietQrPayload(
				amount, transferContent, properties.bankId(), properties.accountNumber(),
				properties.accountName(), quickLink, quickLink, createQrDataUri(quickLink));
	}

	private void ensureConfigured() {
		if (isBlank(properties.bankId()) || isBlank(properties.accountNumber())
				|| isBlank(properties.accountName())) {
			throw new IllegalStateException("VietQR bank configuration is missing.");
		}
	}

	private static boolean isBlank(String value) {
		return value == null || value.isBlank();
	}

	/** {@code Uri.EscapeDataString} (.NET) percent-encodes a space as {@code %20};
	 * {@code URLEncoder} emits {@code +}, which img.vietqr.io would render literally in the
	 * transfer content. */
	private static String encode(String value) {
		return URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20");
	}

	private static String createQrDataUri(String payload) {
		try {
			// Encoded once (the expensive step: segmentation, Reed-Solomon, mask selection), then
			// scaled by hand below. Passing 0x0 makes ZXing return the natural module grid.
			BitMatrix modules = new QRCodeWriter().encode(
					payload, BarcodeFormat.QR_CODE, 0, 0,
					Map.of(EncodeHintType.ERROR_CORRECTION, ErrorCorrectionLevel.Q,
							EncodeHintType.MARGIN, QUIET_ZONE_MODULES,
							EncodeHintType.CHARACTER_SET, StandardCharsets.UTF_8.name()));

			ByteArrayOutputStream out = new ByteArrayOutputStream();
			MatrixToImageWriter.writeToStream(scale(modules, MODULE_PIXELS), "PNG", out);
			return "data:image/png;base64," + Base64.getEncoder().encodeToString(out.toByteArray());
		} catch (WriterException | IOException e) {
			throw new IllegalStateException("Failed to render the VietQR image.", e);
		}
	}

	/** Blows each module up into a {@code factor}×{@code factor} block, so one module is exactly 8
	 * pixels — what QRCoder's {@code GetGraphic(8)} does in the .NET original. */
	private static BitMatrix scale(BitMatrix modules, int factor) {
		BitMatrix scaled = new BitMatrix(modules.getWidth() * factor, modules.getHeight() * factor);
		for (int y = 0; y < modules.getHeight(); y++) {
			for (int x = 0; x < modules.getWidth(); x++) {
				if (modules.get(x, y)) {
					scaled.setRegion(x * factor, y * factor, factor, factor);
				}
			}
		}
		return scaled;
	}
}
