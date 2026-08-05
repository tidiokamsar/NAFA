import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/router/app_router.dart';

void main() {
  runApp(const ProviderScope(child: NafaApp()));
}

/// Application shell. Carries no business logic — it exists so the Flutter
/// toolchain is wired and buildable before feature work starts.
class NafaApp extends StatelessWidget {
  const NafaApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'NAFA',
      routerConfig: appRouter,
      theme: ThemeData(useMaterial3: true),
    );
  }
}
