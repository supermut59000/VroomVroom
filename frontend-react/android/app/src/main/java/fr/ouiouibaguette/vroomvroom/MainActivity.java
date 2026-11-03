package fr.ouiouibaguette.vroomvroom;

import android.os.Bundle;

import androidx.core.view.WindowCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // targetSdk 35+ : Android 15/16 impose l'edge-to-edge (le WebView passe
        // sous la barre de statut, boutons du header intouchables).
        // Opt-out APRES super.onCreate : appele avant, le switch de theme Capacitor
        // (splash -> NoActionBar) est court-circuite et une ActionBar parasite
        // ("Vroo..." + logo) s'affiche au-dessus du header.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
    }
}
