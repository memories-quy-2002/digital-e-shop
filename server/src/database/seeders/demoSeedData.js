const DEMO_PASSWORD = "DemoPass123!";

const DEMO_SEED_PLAN = {
    users: [
        {
            key: "admin",
            id: "demo-digital-e-admin",
            username: "demo_admin_de",
            email: "demo.admin@digital-e.local",
            firstName: "Minh",
            lastName: "Nguyen",
            role: "Admin",
        },
        {
            key: "alice",
            id: "demo-digital-e-alice",
            username: "demo_alice_de",
            email: "demo.alice@digital-e.local",
            firstName: "Ngoc Anh",
            lastName: "Nguyen",
            role: "Customer",
        },
        {
            key: "bob",
            id: "demo-digital-e-bob",
            username: "demo_bob_de",
            email: "demo.bob@digital-e.local",
            firstName: "Quang Huy",
            lastName: "Tran",
            role: "Customer",
        },
        {
            key: "carol",
            id: "demo-digital-e-carol",
            username: "demo_carol_de",
            email: "demo.carol@digital-e.local",
            firstName: "Thu Ha",
            lastName: "Pham",
            role: "Customer",
        },
    ],
    categories: ["Laptop", "Smartphone", "PC", "Monitor", "Headphone", "Graphics Card", "Console", "Camera"],
    brands: [
        "Dell",
        "Samsung",
        "Logitech",
        "Sony",
        "Apple",
        "Nvidia",
        "Asus",
        "Intel",
        "Microsoft",
        "Google",
        "LG",
        "AMD",
        "HP",
        "Bose",
        "JBL",
        "Canon",
    ],
    products: [
        {
            name: "Dell XPS 13 OLED 9320",
            description: "A premium 13-inch OLED laptop with a compact aluminum chassis for mobile work and creative tasks.",
            categoryName: "Laptop",
            brandName: "Dell",
            price: 1599,
            salePrice: 1399,
            stock: 40,
            mainImage: "dell-xps-13-oled-9320",
            specifications: "13.4-inch OLED, Intel Core i7, 16GB RAM, 512GB SSD, Windows 11",
        },
        {
            name: "Samsung Galaxy S24",
            description: "A compact flagship smartphone with a bright AMOLED display, versatile cameras, and long battery life.",
            categoryName: "Smartphone",
            brandName: "Samsung",
            price: 999,
            salePrice: 899,
            stock: 50,
            mainImage: "samsung-galaxy-s24",
            specifications: "6.2-inch AMOLED, 128GB storage, 8GB RAM, 5G, Android 14",
        },
        {
            name: "Logitech MX Keys Mini",
            description: "A low-profile wireless keyboard designed for focused work, with quiet keys and easy device switching.",
            categoryName: "PC",
            brandName: "Logitech",
            price: 129.99,
            salePrice: 99.99,
            stock: 60,
            mainImage: "logitech-mx-keys-mini",
            specifications: "Bluetooth, backlit keys, multi-device pairing, USB-C charging",
        },
        {
            name: "Sony WH-CH720N",
            description: "Lightweight wireless headphones with active noise cancellation for commuting, calls, and everyday listening.",
            categoryName: "Headphone",
            brandName: "Sony",
            price: 399,
            salePrice: 349,
            stock: 45,
            mainImage: "sony-wh-ch720n",
            specifications: "Active noise cancellation, Bluetooth, 35-hour battery, built-in microphone",
        },
        {
            name: "Apple Studio Display",
            description: "A 27-inch 5K Retina display with accurate color and a built-in camera for creative and professional work.",
            categoryName: "Monitor",
            brandName: "Apple",
            price: 1599,
            salePrice: 1499,
            stock: 25,
            mainImage: "apple-studio-display",
            specifications: "27-inch 5K Retina display, 600 nits, 12MP camera, USB-C Thunderbolt",
        },
        {
            name: "Nvidia RTX 4070 Super",
            description: "A high-performance graphics card for high-refresh gaming, ray-traced workloads, and content creation.",
            categoryName: "Graphics Card",
            brandName: "Nvidia",
            price: 699,
            salePrice: 649,
            stock: 30,
            mainImage: "nvidia-rtx-4070-super",
            specifications: "12GB GDDR6X, ray tracing, DLSS 3, PCIe 4.0, triple-display output",
        },
        {
            name: "Asus TUF Gaming VG27AQ",
            description: "A 27-inch QHD gaming monitor with fast refresh, adaptive sync, and a height-adjustable stand.",
            categoryName: "Monitor",
            brandName: "Asus",
            price: 429,
            salePrice: 379,
            stock: 35,
            mainImage: "asus-tuf-gaming-vg27aq",
            specifications: "27-inch QHD IPS, 165Hz, 1ms response time, Adaptive-Sync, DisplayPort",
        },
        {
            name: "Intel Core i7-14700K",
            description: "A powerful desktop processor for gaming, development, and demanding creative workloads.",
            categoryName: "PC",
            brandName: "Intel",
            price: 449,
            salePrice: 419,
            stock: 40,
            mainImage: "intel-core-i7-14700k",
            specifications: "20 cores, up to 5.6GHz, LGA1700 socket, integrated graphics",
        },
        {
            name: "Dell Latitude 7450",
            description: "A dependable business laptop with strong performance, long battery life, and a comfortable work-focused design.",
            categoryName: "Laptop",
            brandName: "Dell",
            price: 1299,
            salePrice: 1099,
            stock: 32,
            mainImage: "dell-latitude-7450",
            specifications: "14-inch display, Intel Core i7, 16GB RAM, 512GB SSD, Windows 11 Pro",
        },
        {
            name: "Asus ZenBook 14 OLED",
            description: "A slim OLED laptop with vivid color, quiet performance, and enough power for work and study on the move.",
            categoryName: "Laptop",
            brandName: "Asus",
            price: 1199,
            salePrice: 999,
            stock: 28,
            mainImage: "asus-zenbook-14-oled",
            specifications: "14-inch OLED, Intel Core i5, 16GB RAM, 512GB SSD, Wi-Fi 6E",
        },
        {
            name: "Apple MacBook Pro M3",
            description: "A high-performance MacBook for developers, creators, and professionals who need sustained everyday power.",
            categoryName: "Laptop",
            brandName: "Apple",
            price: 2499,
            salePrice: 2299,
            stock: 18,
            mainImage: "apple-macbook-pro-m3",
            specifications: "14-inch Liquid Retina XDR, Apple M3, 16GB unified memory, 512GB SSD",
        },
        {
            name: "Microsoft Surface Laptop Studio 2",
            description: "A flexible performance laptop with a touch display that adapts from focused work to creative sketching.",
            categoryName: "Laptop",
            brandName: "Microsoft",
            price: 2399,
            salePrice: 2199,
            stock: 20,
            mainImage: "microsoft-surface-laptop-studio-2",
            specifications: "14.4-inch PixelSense touch, Intel Core i7, 32GB RAM, 1TB SSD",
        },
        {
            name: "Google Pixel 9",
            description: "A clean Android flagship with a bright display, useful camera tools, and smooth day-to-day performance.",
            categoryName: "Smartphone",
            brandName: "Google",
            price: 899,
            salePrice: 829,
            stock: 36,
            mainImage: "google-pixel-9",
            specifications: "6.3-inch OLED, 128GB storage, 8GB RAM, 5G, Android 14",
        },
        {
            name: "Apple iPhone 15",
            description: "A compact premium smartphone with a capable camera system, bright display, and reliable all-day battery.",
            categoryName: "Smartphone",
            brandName: "Apple",
            price: 899,
            salePrice: 849,
            stock: 42,
            mainImage: "apple-iphone-15",
            specifications: "6.1-inch Super Retina display, 128GB storage, A16 Bionic, USB-C",
        },
        {
            name: "Samsung Galaxy A55",
            description: "A well-balanced midrange phone with a bright screen, durable design, and dependable battery life.",
            categoryName: "Smartphone",
            brandName: "Samsung",
            price: 399,
            salePrice: 349,
            stock: 46,
            mainImage: "samsung-galaxy-a55",
            specifications: "6.5-inch AMOLED, 128GB storage, 6GB RAM, 5G, Android 14",
        },
        {
            name: "Dell UltraSharp 34",
            description: "An ultrawide monitor built for multitasking, spreadsheets, editing timelines, and a clean desk setup.",
            categoryName: "Monitor",
            brandName: "Dell",
            price: 999,
            salePrice: 899,
            stock: 24,
            mainImage: "dell-ultrasharp-34",
            specifications: "34-inch UWQHD, 60Hz, USB-C, height-adjustable stand",
        },
        {
            name: "Samsung Odyssey G7 27",
            description: "A fast curved gaming monitor with high refresh, low response time, and immersive contrast.",
            categoryName: "Monitor",
            brandName: "Samsung",
            price: 699,
            salePrice: 599,
            stock: 22,
            mainImage: "samsung-odyssey-g7-27",
            specifications: "27-inch QHD, 240Hz, 1ms response time, curved VA panel",
        },
        {
            name: "LG UltraFine 32 4K",
            description: "A spacious 4K monitor with USB-C connectivity for creators, developers, and home-office setups.",
            categoryName: "Monitor",
            brandName: "LG",
            price: 899,
            salePrice: 799,
            stock: 26,
            mainImage: "lg-ultrafine-32-4k",
            specifications: "32-inch 4K UHD, HDR, USB-C, 60Hz refresh rate",
        },
        {
            name: "Logitech MX Master 3S",
            description: "An ergonomic wireless mouse with quiet clicks and precise tracking for productive desk work.",
            categoryName: "PC",
            brandName: "Logitech",
            price: 109,
            salePrice: 89,
            stock: 45,
            mainImage: "logitech-mx-master-3s",
            specifications: "Bluetooth, USB-C, 8,000 DPI, quiet clicks, multi-device pairing",
        },
        {
            name: "Logitech G Pro X Superlight 2",
            description: "A lightweight wireless gaming mouse with fast response, accurate tracking, and a competition-ready shape.",
            categoryName: "PC",
            brandName: "Logitech",
            price: 159,
            salePrice: 139,
            stock: 29,
            mainImage: "logitech-g-pro-x-superlight-2",
            specifications: "63g, 2.4GHz wireless, USB-C, high-precision sensor",
        },
        {
            name: "Intel NUC 13 Pro",
            description: "A compact mini PC for office work, media playback, and space-efficient productivity setups.",
            categoryName: "PC",
            brandName: "Intel",
            price: 699,
            salePrice: 649,
            stock: 27,
            mainImage: "intel-nuc-13-pro",
            specifications: "Intel Core i7, 16GB RAM, 512GB SSD, Wi-Fi 6E, compact chassis",
        },
        {
            name: "AMD Ryzen 9 7900X",
            description: "A powerful desktop CPU for high-refresh gaming, software builds, and demanding creative workloads.",
            categoryName: "PC",
            brandName: "AMD",
            price: 499,
            salePrice: 459,
            stock: 30,
            mainImage: "amd-ryzen-9-7900x",
            specifications: "12 cores, 24 threads, up to 5.6GHz, AM5 socket",
        },
        {
            name: "HP Omen 45L",
            description: "A high-end gaming desktop with room for demanding games, streaming, and future upgrades.",
            categoryName: "PC",
            brandName: "HP",
            price: 2499,
            salePrice: 2299,
            stock: 16,
            mainImage: "hp-omen-45l",
            specifications: "Intel Core i9, RTX 4080, 32GB RAM, 1TB SSD, Windows 11",
        },
        {
            name: "Bose QuietComfort Ultra",
            description: "Premium wireless headphones with comfortable padding, strong noise cancellation, and spacious sound.",
            categoryName: "Headphone",
            brandName: "Bose",
            price: 429,
            salePrice: 399,
            stock: 27,
            mainImage: "bose-quietcomfort-ultra",
            specifications: "Active noise cancellation, spatial audio, Bluetooth, 24-hour battery",
        },
        {
            name: "JBL Charge 5",
            description: "A portable waterproof speaker with room-filling sound, deep bass, and a battery made for travel.",
            categoryName: "Headphone",
            brandName: "JBL",
            price: 179,
            salePrice: 149,
            stock: 34,
            mainImage: "jbl-charge-5",
            specifications: "IP67, Bluetooth, 20-hour battery, USB-C charging",
        },
        {
            name: "AMD Radeon RX 7900 XT",
            description: "A high-end graphics card for 4K gaming, ray-traced scenes, and accelerated creative applications.",
            categoryName: "Graphics Card",
            brandName: "AMD",
            price: 899,
            salePrice: 829,
            stock: 21,
            mainImage: "amd-radeon-rx-7900-xt",
            specifications: "20GB GDDR6, ray acceleration, PCIe 4.0, 4K-ready output",
        },
        {
            name: "Sony PlayStation 5 Slim",
            description: "A current-generation console with fast loading, immersive games, and a more compact living-room footprint.",
            categoryName: "Console",
            brandName: "Sony",
            price: 499,
            salePrice: 469,
            stock: 25,
            mainImage: "sony-playstation-5-slim",
            specifications: "1TB SSD, 4K gaming, ray tracing, Wi-Fi 6, wireless controller",
        },
        {
            name: "Canon EOS R8",
            description: "A lightweight full-frame mirrorless camera for travel, portraits, video, and everyday creator work.",
            categoryName: "Camera",
            brandName: "Canon",
            price: 1499,
            salePrice: 1399,
            stock: 19,
            mainImage: "canon-eos-r8",
            specifications: "24MP full-frame sensor, 4K video, RF mount, dual-pixel autofocus",
        },
    ],
    carts: [
        {
            key: "alice-cart",
            userKey: "alice",
            done: 0,
            items: [
                { productName: "Asus TUF Gaming VG27AQ", quantity: 1 },
                { productName: "Logitech MX Keys Mini", quantity: 1 },
                { productName: "Dell Latitude 7450", quantity: 1 },
                { productName: "Samsung Odyssey G7 27", quantity: 1 },
            ],
        },
        {
            key: "bob-cart",
            userKey: "bob",
            done: 0,
            items: [
                { productName: "Sony WH-CH720N", quantity: 1 },
                { productName: "Google Pixel 9", quantity: 1 },
                { productName: "Bose QuietComfort Ultra", quantity: 1 },
            ],
        },
        {
            key: "carol-cart",
            userKey: "carol",
            done: 1,
            items: [
                { productName: "Nvidia RTX 4070 Super", quantity: 1 },
                { productName: "AMD Radeon RX 7900 XT", quantity: 1 },
                { productName: "Logitech MX Master 3S", quantity: 1 },
            ],
        },
        {
            key: "admin-cart",
            userKey: "admin",
            done: 1,
            items: [
                { productName: "Apple Studio Display", quantity: 1 },
                { productName: "Canon EOS R8", quantity: 1 },
                { productName: "HP Omen 45L", quantity: 1 },
            ],
        },
    ],
    orders: [
        {
            key: "order-1",
            userKey: "alice",
            status: 1,
            paymentMethod: "bank_transfer",
            discountRate: 10,
            items: [
                { productName: "Dell XPS 13 OLED 9320", quantity: 1 },
                { productName: "Logitech MX Keys Mini", quantity: 1 },
                { productName: "Asus ZenBook 14 OLED", quantity: 1 },
                { productName: "Microsoft Surface Laptop Studio 2", quantity: 1 },
            ],
        },
        {
            key: "order-2",
            userKey: "bob",
            status: 1,
            paymentMethod: "cash",
            discountRate: 0,
            items: [
                { productName: "Samsung Galaxy S24", quantity: 1 },
                { productName: "Google Pixel 9", quantity: 1 },
                { productName: "Apple iPhone 15", quantity: 1 },
            ],
        },
        {
            key: "order-3",
            userKey: "carol",
            status: 0,
            paymentMethod: "bank_transfer",
            discountRate: 0,
            items: [
                { productName: "Nvidia RTX 4070 Super", quantity: 2 },
                { productName: "AMD Radeon RX 7900 XT", quantity: 1 },
                { productName: "HP Omen 45L", quantity: 1 },
            ],
        },
        {
            key: "order-4",
            userKey: "alice",
            status: 1,
            paymentMethod: "cash",
            discountRate: 5,
            items: [
                { productName: "Sony WH-CH720N", quantity: 1 },
                { productName: "Apple Studio Display", quantity: 1 },
                { productName: "Bose QuietComfort Ultra", quantity: 1 },
                { productName: "JBL Charge 5", quantity: 1 },
            ],
        },
        {
            key: "order-5",
            userKey: "bob",
            status: 2,
            paymentMethod: "bank_transfer",
            discountRate: 0,
            items: [
                { productName: "Asus TUF Gaming VG27AQ", quantity: 1 },
                { productName: "Samsung Odyssey G7 27", quantity: 1 },
                { productName: "LG UltraFine 32 4K", quantity: 1 },
            ],
        },
        {
            key: "order-6",
            userKey: "carol",
            status: 1,
            paymentMethod: "cash",
            discountRate: 0,
            items: [
                { productName: "Intel Core i7-14700K", quantity: 1 },
                { productName: "Logitech MX Keys Mini", quantity: 2 },
                { productName: "Intel NUC 13 Pro", quantity: 1 },
                { productName: "AMD Ryzen 9 7900X", quantity: 1 },
                { productName: "Logitech G Pro X Superlight 2", quantity: 1 },
                { productName: "Logitech MX Master 3S", quantity: 1 },
            ],
        },
        {
            key: "order-7",
            userKey: "alice",
            status: 0,
            paymentMethod: "bank_transfer",
            discountRate: 0,
            items: [
                { productName: "Samsung Galaxy S24", quantity: 1 },
                { productName: "Samsung Galaxy A55", quantity: 1 },
                { productName: "Dell Latitude 7450", quantity: 1 },
            ],
        },
        {
            key: "order-8",
            userKey: "bob",
            status: 1,
            paymentMethod: "cash",
            discountRate: 10,
            items: [
                { productName: "Dell XPS 13 OLED 9320", quantity: 1 },
                { productName: "Dell UltraSharp 34", quantity: 1 },
                { productName: "Canon EOS R8", quantity: 1 },
                { productName: "Sony PlayStation 5 Slim", quantity: 1 },
                { productName: "Apple MacBook Pro M3", quantity: 1 },
            ],
        },
    ],
    reviews: [
        { userKey: "alice", productName: "Dell XPS 13 OLED 9320", rating: 5, text: "Fast delivery and an excellent screen for design work." },
        { userKey: "alice", productName: "Logitech MX Keys Mini", rating: 4, text: "Comfortable keys and a clean desktop setup." },
        { userKey: "alice", productName: "Sony WH-CH720N", rating: 5, text: "The noise cancellation is impressive on a commute." },
        { userKey: "alice", productName: "Apple Studio Display", rating: 4, text: "Sharp image and simple USB-C connectivity." },
        { userKey: "bob", productName: "Samsung Galaxy S24", rating: 5, text: "Bright display, smooth performance, and a useful camera." },
        { userKey: "bob", productName: "Asus TUF Gaming VG27AQ", rating: 4, text: "Good color and refresh rate for the price." },
        { userKey: "bob", productName: "Dell XPS 13 OLED 9320", rating: 4, text: "Solid build quality and enough power for daily work." },
        { userKey: "bob", productName: "Sony WH-CH720N", rating: 5, text: "Comfortable for long listening sessions." },
        { userKey: "carol", productName: "Nvidia RTX 4070 Super", rating: 5, text: "Excellent performance for a compact gaming build." },
        { userKey: "carol", productName: "Intel Core i7-14700K", rating: 4, text: "A capable foundation for a quiet workstation." },
        { userKey: "carol", productName: "Logitech MX Keys Mini", rating: 5, text: "The low-profile feel is great for long coding sessions." },
        { userKey: "carol", productName: "Apple Studio Display", rating: 4, text: "Very clear text and consistent colors." },
        { userKey: "admin", productName: "Samsung Galaxy S24", rating: 5, text: "A strong example product for the storefront catalog." },
        { userKey: "admin", productName: "Asus TUF Gaming VG27AQ", rating: 4, text: "Useful size and refresh rate for the catalog." },
        { userKey: "admin", productName: "Nvidia RTX 4070 Super", rating: 5, text: "A strong benchmark product for inventory dashboards." },
        { userKey: "admin", productName: "Intel Core i7-14700K", rating: 4, text: "Clear specifications and a competitive sale price." },
        { userKey: "alice", productName: "Dell Latitude 7450", rating: 4, text: "A comfortable work laptop with a bright screen and solid battery life." },
        { userKey: "alice", productName: "Asus ZenBook 14 OLED", rating: 5, text: "The OLED display is vivid and the laptop is easy to carry." },
        { userKey: "alice", productName: "Microsoft Surface Laptop Studio 2", rating: 4, text: "The flexible display is useful for notes and design work." },
        { userKey: "alice", productName: "Google Pixel 9", rating: 5, text: "Clean Android software and a camera that handles low light well." },
        { userKey: "alice", productName: "Bose QuietComfort Ultra", rating: 5, text: "Very comfortable and effective when working in a busy office." },
        { userKey: "bob", productName: "Apple iPhone 15", rating: 4, text: "Reliable performance, a good camera, and convenient USB-C charging." },
        { userKey: "bob", productName: "Samsung Galaxy A55", rating: 4, text: "Good screen and battery life for everyday use." },
        { userKey: "bob", productName: "Dell UltraSharp 34", rating: 5, text: "The ultrawide layout makes multitasking much easier." },
        { userKey: "bob", productName: "Samsung Odyssey G7 27", rating: 5, text: "Smooth refresh rate and strong contrast for gaming." },
        { userKey: "bob", productName: "JBL Charge 5", rating: 4, text: "Portable, loud enough for a small room, and easy to take outside." },
        { userKey: "carol", productName: "LG UltraFine 32 4K", rating: 4, text: "Plenty of workspace and sharp text for long coding sessions." },
        { userKey: "carol", productName: "Logitech MX Master 3S", rating: 5, text: "The shape is comfortable and switching between devices is simple." },
        { userKey: "carol", productName: "Logitech G Pro X Superlight 2", rating: 5, text: "Lightweight and responsive without unnecessary desk clutter." },
        { userKey: "carol", productName: "Intel NUC 13 Pro", rating: 4, text: "Small footprint and enough performance for an office workstation." },
        { userKey: "carol", productName: "AMD Ryzen 9 7900X", rating: 5, text: "Excellent multi-core performance for builds and creative workloads." },
        { userKey: "admin", productName: "HP Omen 45L", rating: 4, text: "A capable configuration with useful room for future upgrades." },
        { userKey: "admin", productName: "AMD Radeon RX 7900 XT", rating: 5, text: "A strong option for high-resolution gaming and graphics workloads." },
        { userKey: "admin", productName: "Sony PlayStation 5 Slim", rating: 5, text: "Fast loading and a compact design make this easy to feature in the catalog." },
        { userKey: "admin", productName: "Canon EOS R8", rating: 4, text: "A lightweight full-frame camera with approachable controls." },
        { userKey: "admin", productName: "Apple MacBook Pro M3", rating: 5, text: "A strong premium laptop example for the professional segment." },
    ],
    wishlists: [
        { userKey: "alice", productName: "Asus TUF Gaming VG27AQ" },
        { userKey: "alice", productName: "Nvidia RTX 4070 Super" },
        { userKey: "alice", productName: "Samsung Galaxy S24" },
        { userKey: "bob", productName: "Dell XPS 13 OLED 9320" },
        { userKey: "bob", productName: "Apple Studio Display" },
        { userKey: "bob", productName: "Logitech MX Keys Mini" },
        { userKey: "bob", productName: "Intel Core i7-14700K" },
        { userKey: "carol", productName: "Sony WH-CH720N" },
        { userKey: "carol", productName: "Apple Studio Display" },
        { userKey: "carol", productName: "Asus TUF Gaming VG27AQ" },
        { userKey: "admin", productName: "Dell XPS 13 OLED 9320" },
        { userKey: "admin", productName: "Nvidia RTX 4070 Super" },
        { userKey: "alice", productName: "Dell Latitude 7450" },
        { userKey: "alice", productName: "Asus ZenBook 14 OLED" },
        { userKey: "alice", productName: "Microsoft Surface Laptop Studio 2" },
        { userKey: "alice", productName: "Google Pixel 9" },
        { userKey: "alice", productName: "Bose QuietComfort Ultra" },
        { userKey: "bob", productName: "Apple iPhone 15" },
        { userKey: "bob", productName: "Samsung Galaxy A55" },
        { userKey: "bob", productName: "Dell UltraSharp 34" },
        { userKey: "bob", productName: "Samsung Odyssey G7 27" },
        { userKey: "bob", productName: "JBL Charge 5" },
        { userKey: "carol", productName: "LG UltraFine 32 4K" },
        { userKey: "carol", productName: "Logitech MX Master 3S" },
        { userKey: "carol", productName: "Logitech G Pro X Superlight 2" },
        { userKey: "carol", productName: "Intel NUC 13 Pro" },
        { userKey: "carol", productName: "AMD Ryzen 9 7900X" },
        { userKey: "admin", productName: "HP Omen 45L" },
        { userKey: "admin", productName: "AMD Radeon RX 7900 XT" },
        { userKey: "admin", productName: "Sony PlayStation 5 Slim" },
        { userKey: "admin", productName: "Canon EOS R8" },
        { userKey: "admin", productName: "Apple MacBook Pro M3" },
    ],
    addresses: [
        {
            userKey: "alice",
            label: "Home",
            recipientName: "Ngoc Anh Nguyen",
            phoneNumber: "0901000001",
            addressLine: "12 Nguyen Hue Street, District 1",
            city: "Ho Chi Minh City",
            country: "Vietnam",
        },
        {
            userKey: "alice",
            label: "Office",
            recipientName: "Ngoc Anh Nguyen",
            phoneNumber: "0901000001",
            addressLine: "68 Le Loi Street, District 3",
            city: "Ho Chi Minh City",
            country: "Vietnam",
        },
        {
            userKey: "bob",
            label: "Home",
            recipientName: "Quang Huy Tran",
            phoneNumber: "0901000002",
            addressLine: "45 Tran Phu Street",
            city: "Da Nang",
            country: "Vietnam",
        },
        {
            userKey: "carol",
            label: "Home",
            recipientName: "Thu Ha Pham",
            phoneNumber: "0901000003",
            addressLine: "19 Ly Thuong Kiet Street, District 10",
            city: "Ho Chi Minh City",
            country: "Vietnam",
        },
    ],
    notifications: [
        { userKey: "alice", orderKey: "order-1", title: "Demo order completed", message: "Your demo order has been completed." },
        { userKey: "alice", orderKey: "order-7", title: "Demo order is being prepared", message: "Your demo order is being prepared for shipment." },
        { userKey: "bob", orderKey: "order-2", title: "Demo order completed", message: "Your demo order has been completed." },
        { userKey: "bob", orderKey: "order-5", title: "Demo order canceled", message: "Your demo order was canceled." },
        { userKey: "carol", orderKey: "order-3", title: "Demo order received", message: "Your demo order is waiting for fulfillment." },
        { userKey: "carol", orderKey: "order-6", title: "Demo order completed", message: "Your demo order has been completed." },
        { userKey: "admin", orderKey: "order-3", title: "Demo catalog activity", message: "A demo customer placed a graphics card order." },
        { userKey: "admin", orderKey: "order-8", title: "Demo sales activity", message: "A demo laptop order is available in the dashboard." },
    ],
    sessions: [
        { userKey: "admin", daysAgo: 1, durationMinutes: 45 },
        { userKey: "alice", daysAgo: 1, durationMinutes: 25 },
        { userKey: "alice", daysAgo: 3, durationMinutes: 18 },
        { userKey: "bob", daysAgo: 2, durationMinutes: 32 },
        { userKey: "bob", daysAgo: 5, durationMinutes: 12 },
        { userKey: "carol", daysAgo: 1, durationMinutes: 40 },
        { userKey: "carol", daysAgo: 4, durationMinutes: 22 },
        { userKey: "carol", daysAgo: 7, durationMinutes: 15 },
    ],
    discounts: [
        { code: "DEMO10", description: "10% off demo orders", percent: 10, minOrderValue: 100, usageLimit: 100 },
        { code: "DEMO15", description: "15% off larger demo orders", percent: 15, minOrderValue: 500, usageLimit: 50 },
    ],
};

const ensureUnique = (values, label) => {
    const seen = new Set();
    values.forEach((value) => {
        if (seen.has(value)) {
            throw new Error(`Demo seed plan contains a duplicate ${label}: ${value}`);
        }
        seen.add(value);
    });
};

const validateDemoSeedPlan = (plan = DEMO_SEED_PLAN) => {
    ensureUnique(plan.users.map((user) => user.key), "user key");
    ensureUnique(plan.users.map((user) => user.id), "user id");
    ensureUnique(plan.users.map((user) => user.email), "user email");
    ensureUnique(plan.users.map((user) => user.username), "username");
    ensureUnique(plan.categories, "category");
    ensureUnique(plan.brands, "brand");
    ensureUnique(plan.products.map((product) => product.name), "product name");
    ensureUnique(plan.carts.map((cart) => cart.key), "cart key");
    ensureUnique(plan.orders.map((order) => order.key), "order key");
    ensureUnique(plan.discounts.map((discount) => discount.code), "discount code");

    if (!plan.users.some((user) => user.role === "Admin")) {
        throw new Error("Demo seed plan must include an admin account");
    }
    if (!plan.users.some((user) => user.role === "Customer")) {
        throw new Error("Demo seed plan must include a customer account");
    }

    const users = new Set(plan.users.map((user) => user.key));
    const products = new Set(plan.products.map((product) => product.name));
    const categories = new Set(plan.categories);
    const brands = new Set(plan.brands);

    plan.products.forEach((product) => {
        if (!categories.has(product.categoryName)) {
            throw new Error(`Demo seed plan references an unknown category: ${product.categoryName}`);
        }
        if (!brands.has(product.brandName)) {
            throw new Error(`Demo seed plan references an unknown brand: ${product.brandName}`);
        }
        if (typeof product.mainImage !== "string" || product.mainImage.trim() === "") {
            throw new Error(`Demo seed plan is missing a main image: ${product.name}`);
        }
    });

    plan.carts.forEach((cart) => {
        if (!users.has(cart.userKey)) {
            throw new Error(`Demo seed plan references an unknown cart user: ${cart.userKey}`);
        }
        const cartProducts = new Set();
        cart.items.forEach((item) => {
            if (!products.has(item.productName)) {
                throw new Error(`Demo seed plan references an unknown product in cart: ${item.productName}`);
            }
            if (cartProducts.has(item.productName)) {
                throw new Error(`Demo seed plan contains a duplicate cart product: ${item.productName}`);
            }
            if (!Number.isInteger(item.quantity) || item.quantity < 1) {
                throw new Error(`Demo seed plan contains an invalid cart quantity for ${item.productName}`);
            }
            cartProducts.add(item.productName);
        });
    });

    const orderedProductNames = new Set();
    plan.orders.forEach((order) => {
        if (!users.has(order.userKey)) {
            throw new Error(`Demo seed plan references an unknown order user: ${order.userKey}`);
        }
        if (![0, 1, 2].includes(order.status)) {
            throw new Error(`Demo seed plan contains an invalid order status: ${order.status}`);
        }
        const orderProducts = new Set();
        if (order.items.length === 0) {
            throw new Error(`Demo seed plan contains an order without items: ${order.key}`);
        }
        order.items.forEach((item) => {
            if (!products.has(item.productName)) {
                throw new Error(`Demo seed plan references an unknown product in order: ${item.productName}`);
            }
            if (orderProducts.has(item.productName)) {
                throw new Error(`Demo seed plan contains a duplicate order product: ${item.productName}`);
            }
            if (!Number.isInteger(item.quantity) || item.quantity < 1) {
                throw new Error(`Demo seed plan contains an invalid order quantity for ${item.productName}`);
            }
            orderProducts.add(item.productName);
            orderedProductNames.add(item.productName);
        });
    });

    const reviewedProductNames = new Set();
    plan.reviews.forEach((review) => {
        if (!users.has(review.userKey)) {
            throw new Error(`Demo seed plan references an unknown review user: ${review.userKey}`);
        }
        if (!products.has(review.productName)) {
            throw new Error(`Demo seed plan references an unknown product in review: ${review.productName}`);
        }
        if (!Number.isInteger(review.rating) || review.rating < 1 || review.rating > 5) {
            throw new Error(`Demo seed plan contains an invalid review rating: ${review.rating}`);
        }
        reviewedProductNames.add(review.productName);
    });

    const wishlistPairs = new Set();
    const wishlistedProductNames = new Set();
    plan.wishlists.forEach((wishlist) => {
        if (!users.has(wishlist.userKey)) {
            throw new Error(`Demo seed plan references an unknown wishlist user: ${wishlist.userKey}`);
        }
        if (!products.has(wishlist.productName)) {
            throw new Error(`Demo seed plan references an unknown product in wishlist: ${wishlist.productName}`);
        }
        const pair = `${wishlist.userKey}:${wishlist.productName}`;
        if (wishlistPairs.has(pair)) {
            throw new Error(`Demo seed plan contains a duplicate wishlist pair: ${pair}`);
        }
        wishlistPairs.add(pair);
        wishlistedProductNames.add(wishlist.productName);
    });

    for (const productName of products) {
        if (!orderedProductNames.has(productName)) {
            throw new Error(`Demo seed plan leaves a product without an order item: ${productName}`);
        }
        if (!reviewedProductNames.has(productName)) {
            throw new Error(`Demo seed plan leaves a product without a review: ${productName}`);
        }
        if (!wishlistedProductNames.has(productName)) {
            throw new Error(`Demo seed plan leaves a product without a wishlist link: ${productName}`);
        }
    }

    plan.addresses.forEach((address) => {
        if (!users.has(address.userKey)) {
            throw new Error(`Demo seed plan references an unknown address user: ${address.userKey}`);
        }
    });

    const addressUsers = new Set(plan.addresses.map((address) => address.userKey));
    plan.orders.forEach((order) => {
        if (!addressUsers.has(order.userKey)) {
            throw new Error(`Demo seed plan is missing a shipping address for order user: ${order.userKey}`);
        }
    });

    const orderKeys = new Set(plan.orders.map((order) => order.key));
    plan.notifications.forEach((notification) => {
        if (!users.has(notification.userKey)) {
            throw new Error(`Demo seed plan references an unknown notification user: ${notification.userKey}`);
        }
        if (!orderKeys.has(notification.orderKey)) {
            throw new Error(`Demo seed plan references an unknown notification order: ${notification.orderKey}`);
        }
    });

    plan.sessions.forEach((session) => {
        if (!users.has(session.userKey)) {
            throw new Error(`Demo seed plan references an unknown session user: ${session.userKey}`);
        }
    });

    plan.discounts.forEach((discount) => {
        if (discount.percent <= 0 || discount.percent > 100) {
            throw new Error(`Demo seed plan contains an invalid discount percent: ${discount.percent}`);
        }
    });

    return {
        users: plan.users.length,
        categories: plan.categories.length,
        brands: plan.brands.length,
        products: plan.products.length,
        carts: plan.carts.length,
        orders: plan.orders.length,
        reviews: plan.reviews.length,
        wishlists: plan.wishlists.length,
        addresses: plan.addresses.length,
        notifications: plan.notifications.length,
        sessions: plan.sessions.length,
        discounts: plan.discounts.length,
    };
};

module.exports = {
    DEMO_PASSWORD,
    DEMO_SEED_PLAN,
    validateDemoSeedPlan,
};
