package io.github.xlmc.danmu.gradient

import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.sin

/** Optional v1 linear fill only. Parse when loading comments, never in the frame loop. */
data class GradientStop(val position: Double, val rgb: Int, val alpha: Double)
data class GradientFill(val angle: Double, val stops: List<GradientStop>)
data class GradientEndpoints(val x0: Double, val y0: Double, val x1: Double, val y1: Double)

object GradientStyle {
    /** Optional JSON string carrier for disk caches or language bridges. */
    fun readFillJson(extensionJson: String?): GradientFill? {
        if (extensionJson == null) return null
        return try { readFill(JSONObject(extensionJson)) } catch (_: JSONException) { null }
    }

    /** No supported fill means null; the host keeps its original comment and p colour. */
    fun readFill(extension: JSONObject?): GradientFill? {
        if (extension == null || number(extension.opt("extensionVersion")) != 1.0) return null
        val effects = extension.opt("effects") as? JSONArray ?: return null
        if (effects.length() > 8) return null
        for (index in 0 until effects.length()) {
            val effect = effects.opt(index) as? JSONObject ?: continue
            val fill = readEffect(effect)
            if (fill != null) return fill
        }
        return null
    }

    private fun readEffect(effect: JSONObject): GradientFill? {
        if (!hasOnly(effect, setOf("type", "target", "origin", "source"))) return null
        if (effect.opt("type") != "gradient" || effect.opt("target") != "fill") return null
        if (effect.has("origin") && effect.opt("origin") !in setOf("native", "generated")) return null
        val source = effect.opt("source") as? JSONObject ?: return null
        if (!hasOnly(source, setOf("type", "angle", "stops")) || source.opt("type") != "linear") return null
        val angle = number(source.opt("angle")) ?: return null
        if (angle !in -360.0..360.0) return null
        val rawStops = source.opt("stops") as? JSONArray ?: return null
        if (rawStops.length() !in 2..16) return null
        val stops = ArrayList<GradientStop>(rawStops.length())
        for (index in 0 until rawStops.length()) {
            val stop = rawStops.opt(index) as? JSONObject ?: return null
            if (!hasOnly(stop, setOf("position", "color", "alpha"))) return null
            val position = number(stop.opt("position")) ?: return null
            if (position !in 0.0..1.0) return null
            val color = stop.opt("color") as? String ?: return null
            if (!Regex("^#[0-9a-fA-F]{6}$").matches(color)) return null
            val alpha = if (stop.has("alpha")) number(stop.opt("alpha")) ?: return null else 1.0
            if (alpha !in 0.0..1.0) return null
            stops.add(GradientStop(position, color.substring(1).toInt(16), alpha))
        }
        // Kotlin sortedBy is stable: equal-position stops retain wire order.
        return GradientFill(((angle % 360) + 360) % 360, stops.sortedBy { it.position })
    }

    /** Local text box coordinates; 0 degrees points right, 90 degrees points down. */
    fun endpoints(fill: GradientFill, width: Double, height: Double): GradientEndpoints? {
        if (!width.isFinite() || !height.isFinite() || width <= 0 || height <= 0) return null
        val radians = fill.angle * Math.PI / 180
        val dx = cos(radians)
        val dy = sin(radians)
        val extent = (width * abs(dx) + height * abs(dy)) / 2
        return GradientEndpoints(width / 2 - dx * extent, height / 2 - dy * extent,
            width / 2 + dx * extent, height / 2 + dy * extent)
    }

    private fun number(value: Any?): Double? = (value as? Number)?.toDouble()?.takeIf { it.isFinite() }
    private fun hasOnly(value: JSONObject, allowed: Set<String>): Boolean = value.keys().asSequence().all { it in allowed }
}
