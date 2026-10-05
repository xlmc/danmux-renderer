package io.github.xlmc.danmu.gradient

import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Shader
import kotlin.math.roundToInt

/** Drop-in entry for a host that already uses Canvas.drawText for plain text. */
object GradientPainter {
    fun prepareText(fill: GradientFill?, paint: Paint, text: String): PreparedGradient? {
        fill ?: return null
        return PreparedGradient.prepare(fill, paint.measureText(text), paint.descent() - paint.ascent())
    }

    /** One fill call, with the original drawText fallback and host baseline. */
    fun drawText(canvas: Canvas, paint: Paint, text: String, x: Float, baselineY: Float,
                 prepared: PreparedGradient?, useEffects: Boolean = true) {
        val top = baselineY + paint.ascent()
        val left = when (paint.textAlign) {
            Paint.Align.CENTER -> x - (prepared?.width ?: 0f) / 2
            Paint.Align.RIGHT -> x - (prepared?.width ?: 0f)
            else -> x
        }
        val handled = prepared?.drawFill(canvas, paint, left, top, useEffects) { c, p ->
            c.drawText(text, x - left, baselineY - top, p)
        } ?: false
        if (!handled) canvas.drawText(text, x, baselineY, paint)
    }
}

/** Prepared per text/style/size. The host owns its cache and rendering thread. */
class PreparedGradient private constructor(private val shader: LinearGradient, val width: Float) {
    companion object {
        fun prepare(fill: GradientFill?, width: Float, height: Float): PreparedGradient? {
            fill ?: return null
            val points = GradientStyle.endpoints(fill, width.toDouble(), height.toDouble()) ?: return null
            val colors = fill.stops.map { ((it.alpha * 255).roundToInt() shl 24) or it.rgb }.toIntArray()
            val positions = fill.stops.map { it.position.toFloat() }.toFloatArray()
            return PreparedGradient(LinearGradient(points.x0.toFloat(), points.y0.toFloat(),
                points.x1.toFloat(), points.y1.toFloat(), colors, positions, Shader.TileMode.CLAMP), width)
        }
    }

    /**
     * Draw fill in a local text box. x/top are host canvas units; the callback uses
     * local coordinates and the host's baseline. Paint alpha, font and shadows stay
     * owned by the host. Stop alpha is multiplied by Paint alpha by Android.
     */
    fun drawFill(canvas: Canvas, paint: Paint, x: Float, top: Float,
                 useEffects: Boolean = true, drawLocal: (Canvas, Paint) -> Unit): Boolean {
        if (!useEffects || !x.isFinite() || !top.isFinite()) return false
        val previousShader = paint.shader
        val saveCount = canvas.save()
        try {
            canvas.translate(x, top)
            paint.shader = shader
            drawLocal(canvas, paint)
        } finally {
            paint.shader = previousShader
            canvas.restoreToCount(saveCount)
        }
        return true
    }
}
