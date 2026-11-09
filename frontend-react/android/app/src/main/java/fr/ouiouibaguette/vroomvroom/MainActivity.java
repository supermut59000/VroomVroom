package fr.ouiouibaguette.vroomvroom;

import android.os.Bundle;

import androidx.core.view.WindowCompat;

import com.getcapacitor.BridgeActivity;

/**
 * Android 15/16 (targetSdk 35+) : on force l'edge-to-edge pour que le WebView
 * se dessine derrière la barre de statut. La bande de la barre de statut
 * affiche alors le fond de l'app (gris clair en light, noir en dark), qui suit
 * le thème de l'APP et non celui du système.
 *
 * - Le header de l'app est collé juste sous l'horloge côté web
 *   (sticky top-[env(safe-area-inset-top)] — voir Header.tsx / App.tsx).
 * - La couleur des icônes de la barre de statut est pilotée par le plugin
 *   @capacitor/status-bar (sombres sur fond clair, claires sur fond sombre).
 *
 * Appel APRES super.onCreate : avant, le switch de thème Capacitor
 * (splash -> NoActionBar) est court-circuité et une ActionBar parasite
 * s'affiche (voir l'historique du projet).
 */
public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
    }
}
