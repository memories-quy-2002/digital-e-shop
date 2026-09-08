import React from "react";
import { Link } from "react-router-dom";

const ForbiddenPage = () => {
    return (
        <main className="min-h-screen bg-background px-4 py-16 sm:px-6 lg:px-8">
            <section className="mx-auto grid w-full max-w-2xl gap-5 rounded-panel border border-border bg-card p-8 text-center shadow-sm">
                <h1 className="text-3xl font-semibold tracking-tight">Access denied</h1>
                <p className="text-muted-foreground">
                    Your signed-in account is not an Admin and cannot access this page.
                </p>
                <div className="flex flex-wrap justify-center gap-3">
                    <Link className="rounded-md bg-primary px-4 py-2 text-primary-foreground" to="/">
                        Go to home
                    </Link>
                    <Link className="rounded-md border border-border px-4 py-2" to="/account">
                        Go to account
                    </Link>
                </div>
            </section>
        </main>
    );
};

export default ForbiddenPage;
