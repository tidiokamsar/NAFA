import 'package:go_router/go_router.dart';

import '../../features/home/home_screen.dart';

/// Root route table. Feature routes get registered here as they are built.
final appRouter = GoRouter(
  routes: [
    GoRoute(
      path: '/',
      name: 'home',
      builder: (context, state) => const HomeScreen(),
    ),
  ],
);
