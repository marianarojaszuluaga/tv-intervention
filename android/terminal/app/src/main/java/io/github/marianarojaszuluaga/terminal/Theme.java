package io.github.marianarojaszuluaga.terminal;

/**
 * The four themes, the same colours as the webOS app (app/style.css): every text colour is at least 4.5:1 against the
 * background and the cards, to read from 3 m. {@code ink} are the pad's four colours ("1" to "4").
 */
final class Theme {
    final int bg, surface, line, accent, label, accent2, clock, text, dim;
    final int[] ink;
    final boolean light;

    private Theme(int bg, int surface, int line, int accent, int label, int accent2, int clock, int text, int dim,
                  int[] ink, boolean light) {
        this.bg = bg;
        this.surface = surface;
        this.line = line;
        this.accent = accent;
        this.label = label;
        this.accent2 = accent2;
        this.clock = clock;
        this.text = text;
        this.dim = dim;
        this.ink = ink;
        this.light = light;
    }

    static Theme of(String name) {
        switch (name == null ? "" : name) {
            case "ambar":
                return new Theme(0xFF140D04, 0xFF20160A, 0xFF45311A, 0xFFFFB000, 0xFFD69A2E, 0xFFFFD27A, 0xFFFFB000,
                        0xFFFFE6BF, 0xFFCDAA78, new int[] {0xFFFFB000, 0xFFFFE6BF, 0xFFFF7A5C, 0xFF6FD3FF}, false);
            case "synthwave":
                return new Theme(0xFF0B0E29, 0xFF161A40, 0xFF2E3370, 0xFFFF5FD2, 0xFFE07BDD, 0xFF3EE6FF, 0xFF3EE6FF,
                        0xFFF0EEFF, 0xFFABB0DD, new int[] {0xFFFF5FD2, 0xFF3EE6FF, 0xFFFFD45E, 0xFFF0EEFF}, false);
            case "minimal":
                return new Theme(0xFFF5F5F7, 0xFFFFFFFF, 0xFFD2D2D7, 0xFF0066CC, 0xFF6A6A70, 0xFF1D1D1F, 0xFF1D1D1F,
                        0xFF1D1D1F, 0xFF5F5F65, new int[] {0xFF1D1D1F, 0xFF0066CC, 0xFFC4002B, 0xFF1E8E3E}, true);
            default:
                return new Theme(0xFF120A18, 0xFF1E1226, 0xFF3A1E3A, 0xFF3CF2A0, 0xFF3DB083, 0xFF1FC9B2, 0xFFF2B33D,
                        0xFFD8F5E6, 0xFF9DC2B0, new int[] {0xFF3CF2A0, 0xFFF2B33D, 0xFFFF5C7A, 0xFFD8F5E6}, false);
        }
    }

    /** A pad colour: "1" to "4" from the theme, or an old "#rrggbb" stroke as it was sent. */
    int ink(String c) {
        if (c != null && c.length() == 1 && c.charAt(0) >= '1' && c.charAt(0) <= '4') return ink[c.charAt(0) - '1'];
        if (c != null && c.matches("#[0-9a-fA-F]{6}")) return 0xFF000000 | Integer.parseInt(c.substring(1), 16);
        return ink[0];
    }
}
