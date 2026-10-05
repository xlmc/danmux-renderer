package io.github.xlmc.danmu.gradient

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Shader
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], manifest = Config.NONE)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class GradientReferenceTest {
    private fun fill(angle: Double = 0.0, alpha: Double = 1.0) = GradientFill(angle, listOf(
        GradientStop(0.0, 0xff0000, alpha), GradientStop(1.0, 0x0000ff, alpha)))

    @Test fun sharedContractMatchesJsIncludingCanonicalStops() {
        val stream = javaClass.classLoader!!.getResourceAsStream("android-contract.json")!!
        val cases = JSONArray(stream.bufferedReader().use { it.readText() })
        assertTrue("contract should cover shared and mobile edge cases", cases.length() >= 30)
        for (index in 0 until cases.length()) {
            val case = cases.getJSONObject(index)
            val name = case.getString("name")
            val actual = GradientStyle.readFill(case.getJSONObject("comment").optJSONObject("danmux"))
            val expected = case.optJSONObject("expectedFill")
            if (expected == null) {
                assertNull(name, actual)
                continue
            }
            assertNotNull(name, actual)
            val source = expected.getJSONObject("source")
            assertEquals(name, source.getDouble("angle"), actual!!.angle, 0.000001)
            val stops = source.getJSONArray("stops")
            assertEquals(name, stops.length(), actual.stops.size)
            for (stopIndex in 0 until stops.length()) {
                val stop = stops.getJSONObject(stopIndex)
                val parsed = actual.stops[stopIndex]
                assertEquals(name, stop.getDouble("position"), parsed.position, 0.000001)
                assertEquals(name, stop.getString("color").substring(1).toInt(16), parsed.rgb)
                assertEquals(name, stop.getDouble("alpha"), parsed.alpha, 0.000001)
            }
        }
    }

    @Test fun missingAndNonFiniteDataFallBack() {
        assertNull(GradientStyle.readFill(null))
        assertNull(GradientStyle.readFill(JSONObject()))
        assertNull(GradientStyle.endpoints(fill(), Double.NaN, 20.0))
        assertNull(PreparedGradient.prepare(fill(), 0f, 20f))
    }

    @Test fun optionalJsonCarrierSurvivesCacheAndModelCopy() {
        val raw = JSONObject("""{"p":"1.5,1,0,[fixture]","m":"text","danmux":{"extensionVersion":1,"effects":[{"type":"gradient","target":"fill","source":{"type":"linear","angle":-90,"stops":[{"position":1,"color":"#0000ff"},{"position":0,"color":"#ff0000"}]}}]}}""")
        // Host disk/bridge format remains ordinary JSON, never a native Shader.
        val carrier = JSONObject().put("time", 1.5).put("text", raw.getString("m"))
            .put("color", 0).put("danmux", raw.getJSONObject("danmux"))
        val restored = JSONObject(carrier.toString())
        val shifted = JSONObject(restored.toString()).put("time", 6.5)
        val expected = GradientStyle.readFill(raw.getJSONObject("danmux"))
        assertEquals(expected, GradientStyle.readFillJson(shifted.getJSONObject("danmux").toString()))
        assertEquals(0, shifted.getInt("color"))
        assertEquals("text", shifted.getString("text"))
        assertEquals(6.5, shifted.getDouble("time"), 0.0)
        assertNull(GradientStyle.readFillJson(null))
        assertNull(GradientStyle.readFillJson("not JSON"))
        assertNull(GradientStyle.readFillJson("[]"))
        assertNull(GradientStyle.readFillJson("{}"))
    }

    @Test fun projectionFollowsTextBoxAndWireAngles() {
        val horizontal = GradientStyle.endpoints(fill(), 100.0, 40.0)!!
        assertEquals(0.0, horizontal.x0, 0.000001)
        assertEquals(100.0, horizontal.x1, 0.000001)
        assertEquals(20.0, horizontal.y0, 0.000001)
        val vertical = GradientStyle.endpoints(fill(90.0), 100.0, 40.0)!!
        assertEquals(50.0, vertical.x0, 0.000001)
        assertEquals(0.0, vertical.y0, 0.000001)
        assertEquals(40.0, vertical.y1, 0.000001)
        val diagonal = GradientStyle.endpoints(fill(45.0), 100.0, 40.0)!!
        assertEquals(15.0, diagonal.x0, 0.000001)
        assertEquals(-15.0, diagonal.y0, 0.000001)
        assertEquals(85.0, diagonal.x1, 0.000001)
        assertEquals(55.0, diagonal.y1, 0.000001)
    }

    @Test fun nativeShaderRendersDirectionAndMultipliesHostAlpha() {
        for (angle in listOf(0.0, 90.0, 180.0, 270.0)) {
            val bitmap = Bitmap.createBitmap(120, 100, Bitmap.Config.ARGB_8888)
            val canvas = Canvas(bitmap)
            val paint = Paint().apply { alpha = 128 }
            val prepared = PreparedGradient.prepare(fill(angle, 0.5), 100f, 80f)!!
            assertTrue(prepared.drawFill(canvas, paint, 10f, 10f) { c, p -> c.drawRect(0f, 0f, 100f, 80f, p) })
            val first = when (angle) {
                0.0 -> bitmap.getPixel(12, 50)
                90.0 -> bitmap.getPixel(60, 12)
                180.0 -> bitmap.getPixel(107, 50)
                else -> bitmap.getPixel(60, 87)
            }
            assertTrue("red start angle=$angle", Color.red(first) > 220 && Color.blue(first) < 35)
            assertEquals("stop alpha times host alpha", 64.0, Color.alpha(first).toDouble(), 1.0)
            assertEquals(0, bitmap.getPixel(0, 0))
            assertNull(paint.shader)
            assertEquals(128, paint.alpha)
        }
    }

    @Test fun sharedPaintAndCanvasAreRestoredEvenOnExceptionOrDisabledEffects() {
        val canvas = Canvas(Bitmap.createBitmap(100, 60, Bitmap.Config.ARGB_8888))
        val previous = LinearGradient(0f, 0f, 100f, 0f, Color.WHITE, Color.BLACK, Shader.TileMode.CLAMP)
        val paint = Paint().apply { shader = previous; alpha = 77; textSize = 18f }
        val count = canvas.saveCount
        val prepared = PreparedGradient.prepare(fill(), 80f, 40f)!!
        var calls = 0
        assertFalse(prepared.drawFill(canvas, paint, 0f, 0f, false) { _, _ -> calls++ })
        assertEquals(0, calls)
        try {
            prepared.drawFill(canvas, paint, 5f, 4f) { _, _ -> error("host draw failed") }
            fail("exception should propagate")
        } catch (_: IllegalStateException) { }
        assertSame(previous, paint.shader)
        assertEquals(count, canvas.saveCount)
        assertEquals(77, paint.alpha)
        assertEquals(18f, paint.textSize, 0f)
    }

    @Test fun dropInEntryKeepsOriginalFallbackPixelsIncludingBlack() {
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { textSize = 24f; color = Color.BLACK; alpha = 128 }
        val original = Bitmap.createBitmap(140, 60, Bitmap.Config.ARGB_8888)
        Canvas(original).drawText("BASE", 10f, 36f, paint)
        val expected = IntArray(original.width * original.height)
        original.getPixels(expected, 0, original.width, 0, 0, original.width, original.height)
        for (prepared in listOf(null, GradientPainter.prepareText(fill(), paint, "BASE"))) {
            val actual = Bitmap.createBitmap(140, 60, Bitmap.Config.ARGB_8888)
            GradientPainter.drawText(Canvas(actual), paint, "BASE", 10f, 36f, prepared, useEffects = false)
            val pixels = IntArray(expected.size)
            actual.getPixels(pixels, 0, actual.width, 0, 0, actual.width, actual.height)
            assertArrayEquals(expected, pixels)
        }
        assertNull(paint.shader)
        assertEquals(128, paint.alpha)
    }

    @Test fun dropInEntryKeepsGradientInTextBoxForAllTextAlignments() {
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { textSize = 24f; color = Color.WHITE }
        val text = "ALIGNED"
        val prepared = GradientPainter.prepareText(fill(), paint, text)!!
        var expected: IntArray? = null
        for (align in listOf(Paint.Align.LEFT, Paint.Align.CENTER, Paint.Align.RIGHT)) {
            paint.textAlign = align
            val x = when (align) {
                Paint.Align.CENTER -> 10f + prepared.width / 2
                Paint.Align.RIGHT -> 10f + prepared.width
                else -> 10f
            }
            val bitmap = Bitmap.createBitmap(180, 60, Bitmap.Config.ARGB_8888)
            GradientPainter.drawText(Canvas(bitmap), paint, text, x, 36f, prepared)
            val pixels = IntArray(bitmap.width * bitmap.height)
            bitmap.getPixels(pixels, 0, bitmap.width, 0, 0, bitmap.width, bitmap.height)
            if (expected == null) expected = pixels else assertArrayEquals(expected, pixels)
            assertEquals(align, paint.textAlign)
        }
    }

    @Test fun nativeTextUsesHostFontAndCanProducePreview() {
        val bitmap = Bitmap.createBitmap(420, 120, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { textSize = 64f; color = Color.WHITE }
        val text = "GRADIENT"
        val prepared = GradientPainter.prepareText(fill(), paint, text)!!
        GradientPainter.drawText(canvas, paint, text, 20f, 20f - paint.ascent(), prepared)
        var redPixels = 0
        var bluePixels = 0
        for (y in 0 until bitmap.height) for (x in 0 until bitmap.width) {
            val pixel = bitmap.getPixel(x, y)
            if (Color.alpha(pixel) > 128) {
                if (Color.red(pixel) > Color.blue(pixel)) redPixels++ else bluePixels++
            }
        }
        assertTrue(redPixels > 100)
        assertTrue(bluePixels > 100)
        System.getProperty("artifactDir")?.let { path ->
            val directory = File(path).apply { mkdirs() }
            File(directory, "android-native-gradient.png").outputStream().use {
                bitmap.compress(Bitmap.CompressFormat.PNG, 100, it)
            }
        }
    }
}
